import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { messages } from "@/db/schema";
import { getContacts } from "@/lib/contacts";

export async function getLatestInboundMessage(
  recipientUserId: string,
  senderUserId: string,
) {
  const [message] = await db
    .select({
      id: messages.id,
      bitmapData: messages.bitmapData,
      textContent: messages.textContent,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(
      and(
        eq(messages.recipientUserId, recipientUserId),
        eq(messages.senderUserId, senderUserId),
      ),
    )
    .orderBy(desc(messages.id))
    .limit(1);

  return message;
}

export async function createMessage({
  senderUserId,
  recipientUserId,
  textContent,
  bitmapData,
}: {
  senderUserId: string;
  recipientUserId: string;
  textContent: string | null;
  bitmapData: Uint8Array;
}) {
  const [message] = await db
    .insert(messages)
    .values({
      senderUserId,
      recipientUserId,
      textContent,
      bitmapData: Buffer.from(bitmapData),
    })
    .returning({ id: messages.id, createdAt: messages.createdAt });

  return message;
}

export async function storeDeviceBroadcast({
  deviceId,
  senderUserId,
  bitmapData,
  contentSha256,
  idempotencyKey,
}: {
  deviceId: string;
  senderUserId: string;
  bitmapData: Uint8Array;
  contentSha256: string;
  idempotencyKey: string;
}) {
  const recipients = await getContacts(senderUserId);

  if (recipients.length === 0) {
    return { recipientCount: 0, insertedCount: 0 };
  }

  const inserted = await db
    .insert(messages)
    .values(
      recipients.map((recipient) => ({
        senderUserId,
        recipientUserId: recipient.userId,
        bitmapData: Buffer.from(bitmapData),
        sourceDeviceId: deviceId,
        contentSha256,
        idempotencyKey,
      })),
    )
    .onConflictDoNothing({
      target: [
        messages.sourceDeviceId,
        messages.idempotencyKey,
        messages.recipientUserId,
      ],
    })
    .returning({ id: messages.id });

  return {
    recipientCount: recipients.length,
    insertedCount: inserted.length,
  };
}
