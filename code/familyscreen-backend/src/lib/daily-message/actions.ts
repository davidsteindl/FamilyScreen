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
import { refillDailyMessageSlot, type DailyMessageSlot } from "./queries";

const REVIEW_DECISIONS = new Set<DailyMessageStatus>([
  "approved",
  "rejected",
]);

const SLOTS = new Set<DailyMessageSlot>(["today", "tomorrow"]);

export type RegenerateDailyMessageResult =
  | { regenerated: true }
  | { error: string };

/**
 * That day's text again, from scratch. Reject is the wrong verb when the pool
 * claimed a slot because the model was unreachable: nothing is wrong with the
 * seed, it simply is not the line anyone wants on the wall.
 *
 * Shaped for useActionState like createDailyMessage, because this is the one
 * action on the page that keeps the reviewer waiting on a model call and can
 * come back empty without anything being broken.
 */
export async function regenerateDailyMessage(
  _prevState: RegenerateDailyMessageResult | undefined,
  formData: FormData,
): Promise<RegenerateDailyMessageResult> {
  const session = await auth();

  if (!session?.user?.id) {
    return { error: "Please log in again." };
  }

  const slot = formData.get("slot");

  // The slot is a name, never a date: nothing from the form is allowed to pick
  // which calendar day gets rewritten.
  if (typeof slot !== "string" || !SLOTS.has(slot as DailyMessageSlot)) {
    throw new Error("Invalid regenerate request");
  }

  const filled = await refillDailyMessageSlot(slot as DailyMessageSlot);

  // Also on the empty result: the old row was released either way, so the card
  // has to be re-rendered to stop showing a text that no longer owns the date.
  revalidatePath("/daily-messages");
  revalidatePath("/create-homescreen");

  // Tomorrow is deliberately left open when the model does not answer, so the
  // day keeps its remaining polls to get a written line instead of spending
  // itself on a seed. From a button that reads as nothing happening at all.
  if (!filled) {
    return {
      error:
        "No new text came back. The day is open again — try once more, or leave it to the next device poll.",
    };
  }

  return { regenerated: true };
}

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
