import { auth } from "@/auth";
import { MessageComposer } from "@/components/message-composer";
import { getContacts } from "@/lib/messaging/contacts";
import { latestMessagesFrom } from "@/lib/messaging/messages";
import { isBlankBitmap, toBase64 } from "@/lib/screen/bitmap";

export default async function NewMessagePage() {
  const session = await auth();

  // (protected)/layout.tsx redirects, but this still runs alongside it, so bail
  // rather than assert: without a session there is nothing to render anyway.
  if (!session?.user?.id) {
    return null;
  }

  const [contacts, latest] = await Promise.all([
    getContacts(session.user.id),
    latestMessagesFrom(session.user.id),
  ]);

  // Driven by the contact list, so a former contact's bitmap does not ride
  // along. Base64 here rather than in the composer: BitmapCanvas already speaks
  // it, and the packed bytes would otherwise cross the boundary as a JSON
  // number array.
  const live = Object.fromEntries(
    contacts.flatMap((contact) => {
      const current = latest.get(contact.userId);

      return current
        ? [
            [
              contact.userId,
              {
                bitmap: toBase64(current.bitmap),
                sentAt: current.sentAt,
                blank: isBlankBitmap(current.bitmap),
              },
            ],
          ]
        : [];
    }),
  );

  return (
    <>
      <h1 className="mb-6 text-lg font-medium">New message</h1>

      <MessageComposer
        contacts={contacts}
        senderName={session.user.name ?? ""}
        live={live}
      />
    </>
  );
}
