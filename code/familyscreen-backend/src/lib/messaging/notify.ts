import { and, eq, gt, isNotNull, ne } from "drizzle-orm";

import { db } from "@/db";
import { messages } from "@/db/schema";
import { getContacts } from "./contacts";
import { BLANK_SHA256 } from "@/lib/screen/device-wire";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const REQUEST_TIMEOUT_MS = 5_000;

/**
 * One mail per drawing session, not per brush stroke. The screen uploads after
 * every 15 second pause, so an afternoon at the kitchen table is a dozen
 * uploads — without this the family unsubscribes on day one.
 */
const QUIET_WINDOW_MS = 30 * 60 * 1000;

type DrawingNotification = {
  deviceId: string;
  senderUserId: string;
  senderName: string;
  /** Hash of the drawing that just arrived, so it excludes itself below. */
  contentSha256: string;
  inboxUrl: string;
};

async function sendMail(
  apiKey: string,
  from: string,
  to: string,
  subject: string,
  text: string,
) {
  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, text }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(
      `Resend answered ${response.status}: ${await response.text()}`,
    );
  }
}

/**
 * Who still needs telling: everyone with an address, minus those who already had
 * a drawing land in the last half hour and are therefore watching a session in
 * progress. Separate from the sending so it can be checked without a mailbox.
 */
export async function recipientsToNotify({
  deviceId,
  senderUserId,
  contentSha256,
}: Pick<
  DrawingNotification,
  "deviceId" | "senderUserId" | "contentSha256"
>) {
  // The screen owner has no address of their own; the contacts are the family.
  const recipients = (await getContacts(senderUserId)).flatMap((recipient) =>
    recipient.email ? [{ ...recipient, email: recipient.email }] : [],
  );

  if (recipients.length === 0) {
    return recipients;
  }

  const recent = await db
    .selectDistinct({ recipientUserId: messages.recipientUserId })
    .from(messages)
    .where(
      and(
        eq(messages.sourceDeviceId, deviceId),
        gt(messages.createdAt, new Date(Date.now() - QUIET_WINDOW_MS)),
        isNotNull(messages.contentSha256),
        ne(messages.contentSha256, BLANK_SHA256),
        ne(messages.contentSha256, contentSha256),
      ),
    );

  const midSession = new Set(recent.map((row) => row.recipientUserId));

  return recipients.filter((recipient) => !midSession.has(recipient.userId));
}

/**
 * Tells the family that something new is on the screen. Cleared screens do not
 * get here — the caller checks that — and neither does a retried upload.
 *
 * Never throws: an upload that already reached the database must not be
 * reported back to the device as failed just because a mail provider was slow.
 * Without RESEND_API_KEY and MAIL_FROM it quietly does nothing, which keeps
 * local development free of a mail account.
 */
export async function notifyDrawingArrived({
  deviceId,
  senderUserId,
  senderName,
  contentSha256,
  inboxUrl,
}: DrawingNotification) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;

  if (!apiKey || !from) {
    return { sent: 0 };
  }

  try {
    const pending = await recipientsToNotify({
      deviceId,
      senderUserId,
      contentSha256,
    });

    // One request each, so a bounced address cannot hold up the other brother.
    const results = await Promise.allSettled(
      pending.map((recipient) =>
        sendMail(
          apiKey,
          from,
          recipient.email,
          `Neue Zeichnung von ${senderName}`,
          `${senderName} hat etwas auf den FamilyScreen gemalt.\n\nAnsehen: ${inboxUrl}\n`,
        ),
      ),
    );

    for (const result of results) {
      if (result.status === "rejected") {
        console.error("Drawing notification failed:", result.reason);
      }
    }

    return { sent: results.filter(({ status }) => status === "fulfilled").length };
  } catch (error) {
    console.error("Drawing notification failed:", error);
    return { sent: 0 };
  }
}
