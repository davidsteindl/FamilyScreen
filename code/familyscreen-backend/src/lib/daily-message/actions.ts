"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { db } from "@/db";

import { dailyMessages } from "@/db/schema";
import {
  dailyMessageProblems,
  type DailyMessageStatus,
} from "./rules";

const REVIEW_DECISIONS = new Set<DailyMessageStatus>([
  "approved",
  "rejected",
]);

export async function reviewDailyMessage(formData: FormData) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const id = Number(formData.get("id"));
  const decision = formData.get("decision");

  if (
    !Number.isSafeInteger(id) ||
    id < 1 ||
    typeof decision !== "string" ||
    !REVIEW_DECISIONS.has(decision as DailyMessageStatus)
  ) {
    throw new Error("Invalid review request");
  }

  const status = decision as "approved" | "rejected";
  const [updated] = await db
    .update(dailyMessages)
    .set({
      status,
      reviewedAt: new Date(),
      reviewedBy: session.user.id,
      reviewedByName: session.user.name ?? session.user.email ?? "Unknown",
      updatedAt: new Date(),
      ...(status === "rejected" ? { lastDisplayedOn: null } : {}),
    })
    .where(eq(dailyMessages.id, id))
    .returning({ id: dailyMessages.id });

  if (!updated) {
    throw new Error("Daily message not found");
  }

  revalidatePath("/daily-messages");
  revalidatePath("/create-homescreen");
}

/** Permanent deletion is deliberately a second step after rejection. */
export async function deleteDailyMessage(formData: FormData) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const id = Number(formData.get("id"));

  if (!Number.isSafeInteger(id) || id < 1) {
    throw new Error("Invalid delete request");
  }

  const [deleted] = await db
    .delete(dailyMessages)
    .where(
      and(
        eq(dailyMessages.id, id),
        eq(dailyMessages.status, "rejected"),
      ),
    )
    .returning({ id: dailyMessages.id });

  if (!deleted) {
    throw new Error("Only rejected daily messages can be deleted");
  }

  revalidatePath("/daily-messages");
}

export type CreateDailyMessageResult = { created: true } | { error: string };

/**
 * Writing a daily message is the one path into the pool that is not the seed.
 * The author is a signed-in reviewer, so the entry is stored as already
 * approved and carries that review, rather than queueing the writer behind
 * their own approval click.
 */
export async function createDailyMessage(
  _prevState: CreateDailyMessageResult | undefined,
  formData: FormData,
): Promise<CreateDailyMessageResult> {
  // Repeated here rather than left to the layout redirect, which does not
  // protect a POST.
  const session = await auth();

  if (!session?.user?.id) {
    return { error: "Please log in again." };
  }

  const text = String(formData.get("text") ?? "").trim();
  const problems = dailyMessageProblems(text);

  if (problems.length > 0) {
    return { error: problems[0] };
  }

  // lastDisplayedOn stays null, which is what sorts a new entry ahead of every
  // already shown one in chooseDailyCandidate.
  const [created] = await db
    .insert(dailyMessages)
    .values({
      text,
      category: "family",
      status: "approved",
      reviewedBy: session.user.id,
      reviewedByName: session.user.name ?? session.user.email ?? "Unknown",
      reviewedAt: new Date(),
    })
    // The unique text index decides, so two writers cannot race past a select.
    .onConflictDoNothing({ target: dailyMessages.text })
    .returning({ id: dailyMessages.id });

  if (!created) {
    return { error: "That text is already in the list." };
  }

  revalidatePath("/daily-messages");
  revalidatePath("/create-homescreen");

  return { created: true };
}
