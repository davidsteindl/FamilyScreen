"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { db } from "@/db";

import { dailyMessages } from "./schema";
import { dailyMessageProblems } from "./validation";

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
