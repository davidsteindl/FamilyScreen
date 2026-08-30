"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { db } from "@/db";

import { dailyMessages } from "./schema";
import type { DailyMessageStatus } from "./validation";

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
