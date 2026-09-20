import { and, asc, count, desc, eq, inArray, ne } from "drizzle-orm";

import { db } from "@/db";
import { dailyMessages } from "@/db/schema";
import {
  chooseDailyCandidate,
  viennaDateKey,
  viennaNextDateKey,
} from "./selection";
import { generateDailyMessage } from "./generate";
import type { DailyMessageStatus } from "./rules";

export type DailyMessageSlot = "today" | "tomorrow";

function slotKeys(date: Date) {
  const today = viennaDateKey(date);
  const tomorrow = viennaNextDateKey(date);

  if (!today || !tomorrow) {
    throw new Error("Could not determine the Vienna calendar date");
  }

  return { today, tomorrow };
}

async function messagesForDates(dates: string[]) {
  const rows = await db
    .select()
    .from(dailyMessages)
    .where(inArray(dailyMessages.lastDisplayedOn, dates));

  return new Map(rows.map((row) => [row.lastDisplayedOn ?? "", row]));
}

/** Frees the date again, so another message can own it. */
function releaseSlot(id: number) {
  return db
    .update(dailyMessages)
    .set({ lastDisplayedOn: null, updatedAt: new Date() })
    .where(eq(dailyMessages.id, id));
}

/**
 * The oldest unused approved entry claims the date, as it always has. Two
 * things are excluded: rows the model wrote, because a line about one day's
 * rain is false under every other sky, and rows already holding one of the
 * days in play, because moving one of those forward would blank the other.
 */
async function claimCorpusMessage(displayDate: string, reserved: string[]) {
  const candidates = await db
    .select({
      id: dailyMessages.id,
      text: dailyMessages.text,
      lastDisplayedOn: dailyMessages.lastDisplayedOn,
    })
    .from(dailyMessages)
    .where(
      and(
        eq(dailyMessages.status, "approved"),
        ne(dailyMessages.category, "generated"),
      ),
    );

  const free = candidates.filter(
    (item) =>
      !item.lastDisplayedOn || !reserved.includes(item.lastDisplayedOn),
  );

  const selected = chooseDailyCandidate(
    displayDate,
    free,
    new Map(
      free.flatMap((item) =>
        item.lastDisplayedOn
          ? ([[item.id, item.lastDisplayedOn]] as const)
          : [],
      ),
    ),
  );

  if (!selected) {
    return null;
  }

  try {
    const [updated] = await db
      .update(dailyMessages)
      .set({ lastDisplayedOn: displayDate, updatedAt: new Date() })
      .where(
        and(
          eq(dailyMessages.id, selected.id),
          eq(dailyMessages.status, "approved"),
        ),
      )
      .returning({ id: dailyMessages.id, text: dailyMessages.text });

    return updated ?? null;
  } catch (error) {
    // A concurrent request may have claimed this unique date first, whether
    // from the model or from the pool.
    const concurrent = (await messagesForDates([displayDate])).get(displayDate);

    if (concurrent?.status === "approved") {
      return { id: concurrent.id, text: concurrent.text };
    }

    throw error;
  }
}

/**
 * Writes the message that owns one date: the model first, the approved pool
 * when the model is off or unreachable.
 *
 * Only today settles for the pool. The screen is asking for today now, so it
 * has to end up with something, and leaving the date open would call the model
 * again on every one of the day's polls and still risk changing the wall text
 * halfway through the afternoon. Tomorrow has all day and a hundred more polls
 * to succeed, so a failure there is left open and simply tried again rather
 * than spending the whole of tomorrow on a seed because the model was busy for
 * two seconds tonight.
 */
export async function fillDailyMessageSlot(
  dateKey: string,
  dayOffset: 0 | 1,
  reserved: string[],
) {
  const generated = await generateDailyMessage(dateKey, dayOffset);

  if (generated) {
    return generated;
  }

  return dayOffset === 0 ? claimCorpusMessage(dateKey, reserved) : null;
}

/**
 * Today's text, and the day's one piece of upkeep: making sure tomorrow's is
 * already written. Generating a day ahead is what gives the family an evening
 * to look at it and ask for another one before it reaches the wall.
 */
export async function getDailyMessage(date = new Date()) {
  const keys = slotKeys(date);
  const held = await messagesForDates([keys.today, keys.tomorrow]);

  // Repairs a row changed outside the review UI so its date becomes available
  // to another message.
  for (const [dateKey, row] of held) {
    if (row.status !== "approved") {
      await releaseSlot(row.id);
      held.delete(dateKey);
    }
  }

  const reserved = [keys.today, keys.tomorrow];
  const today = held.get(keys.today);

  // At most one slot per request. Only a cold start finds both empty, and
  // spending two model calls inside one request is what would push a device
  // poll past the serverless time limit.
  if (!today) {
    return fillDailyMessageSlot(keys.today, 0, reserved);
  }

  if (!held.has(keys.tomorrow)) {
    await fillDailyMessageSlot(keys.tomorrow, 1, reserved);
  }

  return { id: today.id, text: today.text };
}

/** Both scheduled entries for the review page, either of which may be missing. */
export async function getScheduledDailyMessages(date = new Date()) {
  const keys = slotKeys(date);
  const held = await messagesForDates([keys.today, keys.tomorrow]);

  return {
    today: held.get(keys.today) ?? null,
    tomorrow: held.get(keys.tomorrow) ?? null,
  };
}

/** Throws away what owns a slot and writes it again from scratch. */
export async function refillDailyMessageSlot(
  slot: DailyMessageSlot,
  date = new Date(),
) {
  const keys = slotKeys(date);
  const dateKey = keys[slot];
  const held = (await messagesForDates([dateKey])).get(dateKey);

  if (held?.category === "generated") {
    // A generated line written for one day is of no use on any other, so
    // releasing the date alone would leave an approved row nothing can ever
    // select. Asking for another one is a rejection; recording it as one also
    // routes the row to the existing two-step delete.
    await db
      .update(dailyMessages)
      .set({ status: "rejected", lastDisplayedOn: null, updatedAt: new Date() })
      .where(eq(dailyMessages.id, held.id));
  } else if (held) {
    // A seed is not at fault for standing in while the model was unreachable.
    await releaseSlot(held.id);
  }

  return fillDailyMessageSlot(dateKey, slot === "today" ? 0 : 1, [
    keys.today,
    keys.tomorrow,
  ]);
}

/** One page of the review list, oldest first so the queue is worked front to back. */
export function listDailyMessages(
  status: DailyMessageStatus | "all",
  limit: number,
  offset: number,
) {
  return db
    .select()
    .from(dailyMessages)
    .where(status === "all" ? undefined : eq(dailyMessages.status, status))
    .orderBy(asc(dailyMessages.createdAt), asc(dailyMessages.id))
    .limit(limit)
    .offset(offset);
}

/** Totals for the review filter chips. */
export function dailyMessageCounts() {
  return db
    .select({ status: dailyMessages.status, value: count() })
    .from(dailyMessages)
    .groupBy(dailyMessages.status)
    .orderBy(desc(dailyMessages.status));
}
