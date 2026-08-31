import { createHash } from "node:crypto";

import { local } from "../content/calendar";

type Candidate = { id: number; text: string };

/** toISODate ignores the locale local() sets, so this is the plain Vienna day. */
export function viennaDateKey(date: Date) {
  return local(date).toISODate();
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

const FALLBACK_MESSAGE = "Heute wartet der Tagesgruß noch auf seine Freigabe";

/** A status placeholder, never an unreviewed substitute for editorial content. */
export function fallbackDailyMessage() {
  return FALLBACK_MESSAGE;
}
