import { auth } from "@/auth";
import { AutoRefresh } from "@/components/auto-refresh";
import { BitmapCanvas } from "@/components/bitmap-canvas";
import { formatDayHeading, formatTime } from "@/lib/content/calendar";
import { latestDeviceMessageFor } from "@/lib/messages";
import { toBase64 } from "@/lib/screen/bitmap";

export default async function InboxPage() {
  const session = await auth();

  // (protected)/layout.tsx redirects, but this still runs alongside it, so bail
  // rather than assert: without a session there is nothing to render anyway.
  if (!session?.user?.id) {
    return null;
  }

  const message = await latestDeviceMessageFor(session.user.id);

  return (
    <main className="flex-1 p-8">
      <h1 className="mb-6 text-lg font-medium">Inbox</h1>

      {/* Outside the branch below: an empty inbox is exactly the state that
          wants to notice the first drawing arriving. */}
      <AutoRefresh seconds={20} />

      {!message ? (
        <p className="text-sm text-neutral-500">
          No drawing has arrived from a FamilyScreen yet.
        </p>
      ) : (
        <>
          <p className="mb-4 text-sm text-neutral-500">
            From {message.senderName} · {formatDayHeading(message.createdAt)},{" "}
            {formatTime(message.createdAt)}
          </p>

          {/* The stored bytes are the uploaded bytes, and the canvas is the same
              800x440 the device draws on, so this is the screen's own picture. */}
          <BitmapCanvas
            bitmap={toBase64(message.bitmap)}
            className="max-w-3xl"
          />
        </>
      )}
    </main>
  );
}
