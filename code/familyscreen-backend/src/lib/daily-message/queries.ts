import { and, asc, count, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { dailyMessages } from "@/db/schema";
import {
  chooseDailyCandidate,
  viennaDateKey,
} from "./selection";
import type { DailyMessageStatus } from "./rules";

async function messageForDate(displayDate: string) {
  const [message] = await db
    .select({
      id: dailyMessages.id,
      text: dailyMessages.text,
      status: dailyMessages.status,
    })
    .from(dailyMessages)
    .where(eq(dailyMessages.lastDisplayedOn, displayDate))
    .limit(1);

  return message;
}

export async function getDailyMessage(date = new Date()) {
  const displayDate = viennaDateKey(date);

  if (!displayDate) {
    throw new Error("Could not determine the Vienna calendar date");
  }

  const assigned = await messageForDate(displayDate);

  if (assigned?.status === "approved") {
    return { id: assigned.id, text: assigned.text };
  }

  // Repairs a row changed outside the review UI so the unique date becomes
  // available for another approved message.
  if (assigned) {
    await db
      .update(dailyMessages)
      .set({ lastDisplayedOn: null, updatedAt: new Date() })
      .where(eq(dailyMessages.id, assigned.id));
  }

  const candidates = await db
    .select({
      id: dailyMessages.id,
      text: dailyMessages.text,
      lastDisplayedOn: dailyMessages.lastDisplayedOn,
    })
    .from(dailyMessages)
    .where(eq(dailyMessages.status, "approved"));

  const selected = chooseDailyCandidate(
    displayDate,
    candidates,
    new Map(
      candidates.flatMap((item) =>
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
    // A concurrent request may have claimed today's unique date first.
    const concurrent = await messageForDate(displayDate);

    if (concurrent?.status === "approved") {
      return { id: concurrent.id, text: concurrent.text };
    }

    throw error;
  }
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
