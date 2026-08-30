import { auth } from "@/auth";
import { MessageComposer } from "@/components/message-composer";
import { getContacts } from "@/lib/contacts";

export default async function NewMessagePage() {
  const session = await auth();

  // (protected)/layout.tsx redirects, but this still runs alongside it, so bail
  // rather than assert: without a session there is nothing to render anyway.
  if (!session?.user?.id) {
    return null;
  }

  const contacts = await getContacts(session.user.id);

  return (
    <main className="flex-1 p-8">
      <h1 className="mb-6 text-lg font-medium">New message</h1>

      <MessageComposer
        contacts={contacts}
        senderName={session.user.name ?? ""}
      />
    </main>
  );
}
