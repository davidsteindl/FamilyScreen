import { and, eq } from "drizzle-orm";

import { db } from "@/db";

import { dailyMessages } from "./schema";
import { chooseDailyCandidate, viennaDateKey } from "./selection";

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
