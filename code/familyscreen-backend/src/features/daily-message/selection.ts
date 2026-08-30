import { createHash } from "node:crypto";

import { DateTime } from "luxon";

const TIME_ZONE = "Europe/Vienna";

type Candidate = { id: number; text: string };

export function viennaDateKey(date: Date) {
  return DateTime.fromJSDate(date, { zone: TIME_ZONE }).toISODate();
}

function dailyTieBreaker(dateKey: string, id: number) {
  return createHash("sha256").update(`${dateKey}:${id}`).digest("hex");
}

/**
 * Oldest unused message first. The hash only breaks ties, so concurrent
 * requests deterministically choose the same row.
 */
export function chooseDailyCandidate(
  dateKey: string,
  candidates: Candidate[],
  lastUsed: ReadonlyMap<number, string>,
) {
  return [...candidates].sort((left, right) => {
    const leftDate = lastUsed.get(left.id) ?? "";
    const rightDate = lastUsed.get(right.id) ?? "";

    return (
      leftDate.localeCompare(rightDate) ||
      dailyTieBreaker(dateKey, left.id).localeCompare(
        dailyTieBreaker(dateKey, right.id),
      )
    );
  })[0];
}

