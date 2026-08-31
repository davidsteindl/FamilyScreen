import { and, count, desc, eq, isNotNull, ne, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { messages, users } from "@/db/schema";
import { getContacts } from "@/lib/contacts";
import { BITMAP_BYTES } from "@/lib/screen/bitmap";
import { BLANK_SHA256 } from "@/lib/screen/device-wire";

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

/**
 * The newest message per counterpart, in one query: one side of the pairing is
 * fixed, the other is what the rows are grouped by. DISTINCT ON needs its column
 * to lead the ordering, and the id then picks the newest row within each group.
 *
 * Device uploads count. A drawing made on a physical screen lands on its
 * contacts' pages exactly like a composed message does, so leaving it out would
 * report a state the screens do not actually hold.
 */
async function latestPerCounterpart(
  fixed: SQL,
  counterpart: typeof messages.senderUserId | typeof messages.recipientUserId,
) {
  const rows = await db
    .selectDistinctOn([counterpart], {
      counterpartId: counterpart,
      bitmapData: messages.bitmapData,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(fixed)
    .orderBy(counterpart, desc(messages.id));

  return new Map(
    rows.flatMap((row) => {
      const bitmap = toBitmap(row.bitmapData);

      return bitmap
        ? [[row.counterpartId, { bitmap, sentAt: row.createdAt }] as const]
        : [];
    }),
  );
}

/** What this sender currently has on each of their recipients' screens. */
export function latestMessagesFrom(senderUserId: string) {
  return latestPerCounterpart(
    eq(messages.senderUserId, senderUserId),
    messages.recipientUserId,
  );
}

/** What this recipient currently sees from each of the people who write to them. */
export function latestMessagesTo(recipientUserId: string) {
  return latestPerCounterpart(
    eq(messages.recipientUserId, recipientUserId),
    messages.senderUserId,
  );
}

/** Drawings a physical screen uploaded to this recipient — inbox and history alike. */
function deviceMessagesTo(recipientUserId: string) {
  return and(
    eq(messages.recipientUserId, recipientUserId),
    isNotNull(messages.sourceDeviceId),
  );
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
    .where(deviceMessagesTo(recipientUserId))
    .orderBy(desc(messages.id))
    .limit(1);

  const bitmap = toBitmap(row?.bitmapData);

  return bitmap
    ? { bitmap, senderName: row.senderName, createdAt: row.createdAt }
    : null;
}

/**
 * Every drawing that ever reached this recipient, newest first — the rows the
 * inbox only ever shows the top of.
 *
 * A cleared screen belongs to the live state, not to a history of drawings, so
 * it is filtered out by hash: no row has to be read to know it is blank. A row
 * without a hash is filtered out with it, since ne() is NULL against NULL — the
 * same behaviour recipientsToNotify already relies on, and device uploads have
 * carried a hash since the column exists.
 */
export async function deviceMessageHistoryFor(
  recipientUserId: string,
  { limit, offset }: { limit: number; offset: number },
) {
  const where = and(
    deviceMessagesTo(recipientUserId),
    ne(messages.contentSha256, BLANK_SHA256),
  );

  const [rows, [total]] = await Promise.all([
    db
      .select({
        id: messages.id,
        bitmapData: messages.bitmapData,
        senderName: users.name,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .innerJoin(users, eq(users.id, messages.senderUserId))
      .where(where)
      .orderBy(desc(messages.id))
      .limit(limit)
      .offset(offset),
    db.select({ value: count() }).from(messages).where(where),
  ]);

  const items = rows.flatMap((row) => {
    const bitmap = toBitmap(row.bitmapData);

    return bitmap ? [{ ...row, bitmap }] : [];
  });

  return { items, total: total?.value ?? 0 };
}

/** One drawing from that history. Scoped by recipient: a stranger's id is a miss. */
export async function deviceMessageFor(recipientUserId: string, id: number) {
  const [row] = await db
    .select({
      bitmapData: messages.bitmapData,
      senderName: users.name,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .innerJoin(users, eq(users.id, messages.senderUserId))
    .where(and(deviceMessagesTo(recipientUserId), eq(messages.id, id)))
    .limit(1);

  const bitmap = toBitmap(row?.bitmapData);

  return bitmap
    ? { bitmap, senderName: row.senderName, createdAt: row.createdAt }
    : null;
}

/**
 * Which history entry is the one standing on the screens right now. Blanks are
 * read here rather than filtered, because a cleared screen means no drawing is
 * current — not that the drawing before the clear still is.
 */
export async function currentDeviceMessageId(recipientUserId: string) {
  const [row] = await db
    .select({ id: messages.id, contentSha256: messages.contentSha256 })
    .from(messages)
    .where(deviceMessagesTo(recipientUserId))
    .orderBy(desc(messages.id))
    .limit(1);

  return row && row.contentSha256 !== BLANK_SHA256 ? row.id : null;
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
