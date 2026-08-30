import { and, desc, eq, isNotNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { messages, users } from "@/db/schema";
import { getContacts } from "@/lib/contacts";
import { BITMAP_BYTES } from "@/lib/screen/bitmap";

/**
 * drizzle-orm 1.0.0-rc.4 normalises a bytea parameter with String(), which
 * utf8-decodes the Buffer and destroys every byte above 0x7f — a 44 kB bitmap
 * arrives as replacement characters. Handing Postgres hex sidesteps the codec,
 * because an SQL chunk has no column encoder for it to apply.
 * One line instead of a custom column type; drop it once drizzle ships a fix.
 */
function toBytea(bytes: Uint8Array) {
  return sql`decode(${Buffer.from(bytes).toString("hex")}, 'hex')`;
}

/**
 * Rows stored before the screen grew to 440 rows are the wrong length, and the
 * firmware rejects a short page rather than drawing it. Treat them as absent.
 * The driver hands back a Buffer; the renderers speak Uint8Array.
 */
function toBitmap(bitmapData: Buffer | null | undefined) {
  return bitmapData?.byteLength === BITMAP_BYTES
    ? Uint8Array.from(bitmapData)
    : null;
}

/** The newest message this sender wrote to this recipient, as the device shows it. */
export async function latestMessageFor(
  senderUserId: string,
  recipientUserId: string,
) {
  const [row] = await db
    .select({ bitmapData: messages.bitmapData })
    .from(messages)
    .where(
      and(
        eq(messages.senderUserId, senderUserId),
        eq(messages.recipientUserId, recipientUserId),
      ),
    )
    .orderBy(desc(messages.id))
    .limit(1);

  return toBitmap(row?.bitmapData);
}

/**
 * The newest drawing a physical screen uploaded to this recipient, byte for byte
 * as it left the device: the 800x440 content area, without the label header the
 * firmware draws on top of it locally.
 */
export async function latestDeviceMessageFor(recipientUserId: string) {
  const [row] = await db
    .select({
      bitmapData: messages.bitmapData,
      senderName: users.name,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .innerJoin(users, eq(users.id, messages.senderUserId))
    .where(
      and(
        eq(messages.recipientUserId, recipientUserId),
        isNotNull(messages.sourceDeviceId),
      ),
    )
    .orderBy(desc(messages.id))
    .limit(1);

  const bitmap = toBitmap(row?.bitmapData);

  return bitmap
    ? { bitmap, senderName: row.senderName, createdAt: row.createdAt }
    : null;
}

export async function insertMessage(
  senderUserId: string,
  recipientUserId: string,
  text: string,
  bitmap: Uint8Array,
) {
  await db.insert(messages).values({
    senderUserId,
    recipientUserId,
    textContent: text,
    bitmapData: toBytea(bitmap),
  });
}

/**
 * A drawing uploaded by a physical screen goes to every contact at once: the
 * device has no recipient picker, so drawing on it means showing the family.
 *
 * The screen uploads its current state, not an event, so the same bytes arrive
 * both from a retried upload and from a genuine repeat — clearing the screen
 * always produces the identical blank bitmap. Deduplicating on the content hash
 * alone therefore swallowed every clear after the first. What separates the two
 * is what came before: a retry repeats the state already stored, a repeat
 * follows something else. So a recipient is skipped only while the newest row
 * this device wrote for them already carries this hash.
 */
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

  // DISTINCT ON needs its column to lead the ordering; the id then picks the
  // newest row within each recipient.
  const newest = await db
    .selectDistinctOn([messages.recipientUserId], {
      recipientUserId: messages.recipientUserId,
      contentSha256: messages.contentSha256,
    })
    .from(messages)
    .where(eq(messages.sourceDeviceId, deviceId))
    .orderBy(messages.recipientUserId, desc(messages.id));

  const unchanged = new Set(
    newest
      .filter((row) => row.contentSha256 === contentSha256)
      .map((row) => row.recipientUserId),
  );

  const pending = recipients.filter(
    (recipient) => !unchanged.has(recipient.userId),
  );

  if (pending.length === 0) {
    return { recipientCount: recipients.length, insertedCount: 0 };
  }

  const inserted = await db
    .insert(messages)
    .values(
      pending.map((recipient) => ({
        senderUserId,
        recipientUserId: recipient.userId,
        bitmapData: toBytea(bitmapData),
        sourceDeviceId: deviceId,
        contentSha256,
        idempotencyKey,
      })),
    )
    .returning({ id: messages.id });

  return {
    recipientCount: recipients.length,
    insertedCount: inserted.length,
  };
}
