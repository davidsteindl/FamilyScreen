import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { messages } from "@/db/schema";

/**
 * drizzle-orm 1.0.0-rc.4 normalises a bytea parameter with String(), which
 * utf8-decodes the Buffer and destroys every byte above 0x7f — a 40 kB bitmap
 * arrives as replacement characters. Handing Postgres hex sidesteps the codec,
 * because an SQL chunk has no column encoder for it to apply.
 * One line instead of a custom column type; drop it once drizzle ships a fix.
 */
function toBytea(bytes: Uint8Array) {
  return sql`decode(${Buffer.from(bytes).toString("hex")}, 'hex')`;
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

  // The driver hands back a Buffer; the renderers speak Uint8Array.
  return row ? Uint8Array.from(row.bitmapData) : null;
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
