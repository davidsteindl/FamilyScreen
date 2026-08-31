"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/auth";
import { canCommunicate } from "./contacts";
import { insertMessage } from "./messages";
import { tileStride } from "@/lib/screen/bitmap-render";
import {
  IMAGE_MAX_HEIGHT,
  IMAGE_MAX_WIDTH,
  renderMessage,
} from "@/lib/screen/message";

export type SendResult = { sent: true } | { error: string };

/**
 * The picture arrives already packed to 1 bpp, so the server needs no image
 * decoder. Its dimensions still have to be checked against the cell, and the
 * byte count against them, or drawTile would read past the buffer.
 */
const imageSchema = z
  .object({
    width: z.coerce.number().int().positive().max(IMAGE_MAX_WIDTH),
    height: z.coerce.number().int().positive().max(IMAGE_MAX_HEIGHT),
    bytes: z.base64(),
  })
  .transform(({ width, height, bytes }) => ({
    width,
    height,
    bytes: Uint8Array.from(atob(bytes), (character) => character.charCodeAt(0)),
  }))
  .refine(
    (tile) => tile.bytes.length === tileStride(tile.width) * tile.height,
    "The image does not match its dimensions.",
  );

const messageSchema = z.object({
  recipientId: z.uuid(),
  // Trimming does not drift from the untrimmed preview: wrapText drops empty
  // tokens, so surrounding blanks draw the same either way.
  text: z.string().trim().min(1).max(280),
  image: imageSchema.optional(),
});

export async function sendMessage(
  _prevState: SendResult | undefined,
  formData: FormData,
): Promise<SendResult> {
  const session = await auth();

  if (!session?.user?.id) {
    return { error: "Please log in again." };
  }

  const imageBytes = formData.get("imageBytes");

  const parsed = messageSchema.safeParse({
    recipientId: formData.get("recipientId"),
    text: formData.get("text"),
    image: imageBytes
      ? {
          width: formData.get("imageWidth"),
          height: formData.get("imageHeight"),
          bytes: imageBytes,
        }
      : undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid message." };
  }

  const { recipientId, text, image } = parsed.data;

  if (!(await canCommunicate(session.user.id, recipientId))) {
    return { error: "That person is not one of your contacts." };
  }

  // The same call the composer previews with, so what is stored is what was seen.
  const bitmap = renderMessage({
    from: session.user.name ?? "",
    sentAt: new Date(),
    text,
    image,
  });

  await insertMessage(session.user.id, recipientId, text, bitmap);

  revalidatePath("/new-message");

  return { sent: true };
}
