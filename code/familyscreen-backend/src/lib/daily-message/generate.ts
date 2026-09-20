import { DateTime } from "luxon";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { dailyMessages, users } from "@/db/schema";
import { TIME_ZONE } from "../content/calendar";
import { getEvents } from "../content/events";
import { getWeather, OTTENSCHLAG } from "../content/weather";
import {
  buildDailyMessagePrompt,
  planDailyMessage,
  GENERATED_MAX_LENGTH,
  type DailyMessageContext,
} from "./prompt";
import { dailyMessageProblems } from "./rules";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * Flash-Lite, not Flash. Flash would write better German, but every thinking
 * Flash model answered 503 on the free tier when this was measured, and a
 * screen that falls back to the pool most days is worse than one with slightly
 * plainer sentences. Flash-Lite answers in one to three seconds and does not
 * think, so it also fits the request budget with room to spare.
 *
 * Pinned rather than an alias, so the tone does not change under the family
 * because Google promoted a new default.
 */
const DEFAULT_MODEL = "gemini-3.5-flash-lite";

/**
 * Measured over ~30 calls: a successful answer lands between 0.7 and 3.0
 * seconds. A failing one does not come back at all -- a 30 second ceiling was
 * tried and hit just as often as this one. Since a stall is unbounded rather
 * than merely slow, the cap is set for the good case with headroom, and the
 * retry that matters is the next device poll ten minutes later.
 */
const REQUEST_TIMEOUT_MS = 6_000;

const replySchema = z.object({
  candidates: z
    .array(
      z.object({
        content: z.object({
          parts: z.array(z.object({ text: z.string() })).min(1),
        }),
      }),
    )
    .min(1),
});

const answerSchema = z.object({ text: z.string() });

/**
 * One sentence from Gemini. Throws on anything unexpected, including a safety
 * block: that arrives as a candidate carrying a finishReason and no parts, so
 * the schema above rejects it and the caller falls back to the approved pool,
 * which is the right answer and needs no branch of its own.
 */
async function askGemini(
  apiKey: string,
  model: string,
  system: string,
  user: string,
) {
  const response = await fetch(`${ENDPOINT}/${model}:generateContent`, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ parts: [{ text: user }] }],
      generationConfig: {
        // Generous on purpose. Flash-Lite does not think and needs a fraction
        // of this, but a thinking model set through GEMINI_MODEL spends the
        // budget before it writes: measured at 487 thinking tokens against a
        // 512 cap, which returns MAX_TOKENS and truncated JSON mid-sentence.
        maxOutputTokens: 2048,
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: { text: { type: "string" } },
          required: ["text"],
        },
      },
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    // The only debugging surface a deliberately silent feature has.
    throw new Error(
      `Gemini answered ${response.status}: ${await response.text()}`,
    );
  }

  const reply = replySchema.parse(await response.json());

  return answerSchema.parse(
    JSON.parse(reply.candidates[0].content.parts[0].text),
  ).text.trim();
}

/** Everything the model is allowed to know about that day. */
async function collectContext(
  dateKey: string,
  dayOffset: number,
): Promise<DailyMessageContext> {
  const targetDate = DateTime.fromISO(dateKey, {
    zone: TIME_ZONE,
  }).toJSDate();

  const [weather, events, household, approved] = await Promise.all([
    // Never mockWeather: the renderer may draw a stand-in so the screen is not
    // blank, but a sentence must not state invented weather as fact.
    getWeather(OTTENSCHLAG).catch(() => null),
    getEvents(targetDate).catch(() => []),
    db.select({ name: users.name }).from(users),
    db
      .select({
        text: dailyMessages.text,
        category: dailyMessages.category,
        lastDisplayedOn: dailyMessages.lastDisplayedOn,
      })
      .from(dailyMessages)
      .where(eq(dailyMessages.status, "approved")),
  ]);

  const family = approved
    .filter((row) => row.category === "family")
    .map((row) => row.text);

  return {
    events,
    // Open-Meteo is asked for two days, so anything further out has no forecast
    // and the planner drops the weather angle rather than guessing at one.
    weather: !weather
      ? null
      : dayOffset === 0
        ? { code: weather.dayCode, high: weather.high, low: weather.low }
        : dayOffset === 1
          ? weather.tomorrow
          : null,
    names: household.map((row) => row.name),
    household: process.env.HOUSEHOLD_CONTEXT?.trim() || undefined,
    // Split rather than merged: what the family wrote themselves is the voice
    // worth copying, and the prompt gives it precedence over the seeds without
    // dropping them. Generated rows are in neither -- a line written for one
    // day's weather is no example of anything.
    examples: approved
      .filter(
        (row) => row.category !== "generated" && row.category !== "family",
      )
      .map((row) => row.text),
    ownExamples: family,
    // Most recently scheduled first. How many of them the model actually sees
    // is the prompt's business, and the cap lives there so it is stated once.
    recent: approved
      .filter((row) => row.lastDisplayedOn)
      .sort((left, right) =>
        (right.lastDisplayedOn ?? "").localeCompare(left.lastDisplayedOn ?? ""),
      )
      .map((row) => row.text),
  };
}

/**
 * The sentence, without storing it. Split out so the whole expensive half --
 * the day's context, the angle, the prompt, the model, the validator -- can be
 * run and looked at without a row appearing and a date being claimed.
 */
export async function draftDailyMessage(dateKey: string, dayOffset: number) {
  const apiKey = process.env.GEMINI_API_KEY?.trim();

  if (!apiKey) {
    return null;
  }

  const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
  const context = await collectContext(dateKey, dayOffset);
  const angle = planDailyMessage(dateKey, context);

  let correction: string | undefined;

  // Two attempts at most, and the second only because the first one answered:
  // a validation failure means the model was fast and the retry is affordable,
  // while a timeout means it was not and a blind retry blows the request
  // budget the device is waiting on.
  for (let attempt = 0; attempt < 2; attempt++) {
    const prompt = buildDailyMessagePrompt(angle, dateKey, context, correction);
    const text = await askGemini(apiKey, model, prompt.system, prompt.user);

    const problems = [
      ...dailyMessageProblems(text),
      ...(text.length > GENERATED_MAX_LENGTH
        ? [
            `Text has ${text.length} characters; keep it under ${GENERATED_MAX_LENGTH}`,
          ]
        : []),
    ];

    if (problems.length === 0) {
      return { text, angle, model };
    }

    console.error(`Daily message rejected: ${problems[0]} (${text})`);
    correction = problems[0];
  }

  return null;
}

/**
 * The day's line, written for that day's calendar and weather and stored as the
 * row that owns the date.
 *
 * Never throws, and returns null whenever nothing usable came back: without
 * GEMINI_API_KEY the feature is simply off, and the approved corpus behaves
 * exactly as it did before. Same shape as notifyDrawingArrived, and for the
 * same reason -- a wall screen must not go blank because a provider was slow.
 */
export async function generateDailyMessage(dateKey: string, dayOffset: 0 | 1) {
  try {
    const draft = await draftDailyMessage(dateKey, dayOffset);

    if (!draft) {
      return null;
    }

    const [inserted] = await db
      .insert(dailyMessages)
      .values({
        text: draft.text,
        category: "generated",
        status: "approved",
        lastDisplayedOn: dateKey,
        sourceName: draft.model,
        reviewNote: draft.angle,
      })
      // No target, so it covers the unique date and the unique text alike.
      // Either collision means this is not the row that owns the day, and the
      // caller's corpus path already recovers from both.
      .onConflictDoNothing()
      .returning({ id: dailyMessages.id, text: dailyMessages.text });

    return inserted ?? null;
  } catch (error) {
    console.error("Daily message generation failed:", error);

    return null;
  }
}
