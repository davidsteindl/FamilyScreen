/**
 * Prints what the daily message would be for the next N days, without writing
 * anything. Same context, planner, prompt, model and validator the device path
 * uses -- only the insert is missing, so no date gets claimed.
 *
 *   npx tsx --env-file=.env.local preview-daily.ts [days]
 *
 * Against another database, set DATABASE_URL in the shell first; it wins over
 * the env file.
 */
import { DateTime } from "luxon";
import { URL } from "node:url";

import { TIME_ZONE } from "@/lib/content/calendar";
import { describeWeatherCode } from "@/lib/content/weather";
import { draftDailyMessage } from "@/lib/daily-message/generate";

const DAYS = Number(process.argv[2] ?? 10);

async function main() {
  console.log(`database: ${new URL(process.env.DATABASE_URL!).hostname}`);
  console.log(`model:    ${process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash-lite (default)"}`);
  console.log(`weather:  only for today and tomorrow, further out has no forecast\n`);

  const today = DateTime.now().setZone(TIME_ZONE).setLocale("de-AT");

  for (let offset = 0; offset < DAYS; offset++) {
    const day = today.plus({ days: offset });
    const dateKey = day.toISODate()!;
    const started = Date.now();

    // Roughly one call in eight stalls and is cut off by the timeout. In
    // production the next device poll simply tries again; here a stall would
    // read as a gap in the sample, so ask twice before reporting one.
    let line = "";
    let detail: string[] = [];

    for (let attempt = 0; attempt < 2 && !line; attempt++) {
      try {
        const draft = await draftDailyMessage(dateKey, offset);

        if (!draft) {
          line = "(nichts Brauchbares -- Fallback auf den Bestand)";
          break;
        }

        line = `${draft.angle.padEnd(8)} ${String(draft.text.length).padStart(3)}ch  ${draft.text}`;

        // What the model was actually told, so the sentence can be judged
        // against its input rather than against a second query that might
        // disagree with it.
        const { weather, events } = draft.context;

        detail = [
          weather
            ? `Wetter:  ${describeWeatherCode(weather.code)}, Hoch ${Math.round(weather.high)}, Tief ${Math.round(weather.low)}`
            : "Wetter:  keine Vorhersage",
          events.length
            ? `Termine: ${events.join(" | ")}`
            : "Termine: keine",
        ];
      } catch (error) {
        if (attempt === 1) line = `HAENGER (${String(error).slice(0, 40)})`;
      }
    }

    console.log(
      `${day.toFormat("ccc dd.LL.")} ${String(Date.now() - started).padStart(5)}ms  ${line}`,
    );
    for (const row of detail) console.log(`              ${row}`);
  }
}

main();
