import { z } from "zod";

import { auth } from "@/auth";
import { getContacts } from "@/lib/contacts";
import { createMessage } from "@/lib/messages";
import { renderMessageBitmap } from "@/lib/screen/message-screen";

export const runtime = "nodejs";

const messageSchema = z.object({
  recipientUserId: z.string().uuid(),
  message: z.string().trim().min(1).max(500),
});

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = messageSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return Response.json(
      { error: "Choose a contact and enter a message of at most 500 characters." },
      { status: 400 },
    );
  }

  const contacts = await getContacts(session.user.id);
  const recipient = contacts.find(
    (contact) => contact.userId === parsed.data.recipientUserId,
  );

  if (!recipient) {
    return Response.json(
      { error: "This recipient is not one of your contacts." },
      { status: 403 },
    );
  }

  const sentAt = new Date();
  const bitmapData = renderMessageBitmap({
    sender: session.user.name ?? "Familie",
    recipient: recipient.name,
    message: parsed.data.message,
    sentAt,
  });
  const message = await createMessage({
    senderUserId: session.user.id,
    recipientUserId: recipient.userId,
    textContent: parsed.data.message,
    bitmapData,
  });

  return Response.json(
    { ok: true, messageId: message?.id },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}
