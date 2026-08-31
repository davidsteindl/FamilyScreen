import Link from "next/link";

import { auth } from "@/auth";
import { AutoRefresh } from "@/components/auto-refresh";
import { BitmapCanvas } from "@/components/bitmap-canvas";
import { buttonVariants } from "@/components/ui/button";
import { formatDayHeading, formatTime } from "@/lib/content/calendar";
import { latestDeviceMessageFor } from "@/lib/messaging/messages";
import { isBlankBitmap, toBase64 } from "@/lib/screen/bitmap";

export default async function InboxPage() {
  const session = await auth();

  // (protected)/layout.tsx redirects, but this still runs alongside it, so bail
  // rather than assert: without a session there is nothing to render anyway.
  if (!session?.user?.id) {
    return null;
  }

  const message = await latestDeviceMessageFor(session.user.id);

  const cleared = message ? isBlankBitmap(message.bitmap) : false;

  return (
    <>
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-lg font-medium">Inbox</h1>

        <Link
          href="/inbox/history"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          View history
        </Link>
      </div>

      {/* Outside the branch below: an empty inbox is exactly the state that
          wants to notice the first drawing arriving. */}
      <AutoRefresh seconds={20} />

      {!message ? (
        <p className="text-sm text-neutral-500">
          No drawing has arrived from a FamilyScreen yet.
        </p>
      ) : (
        <>
          <div className="mb-4 text-sm text-neutral-500">
            <p>
              From {message.senderName} · {formatDayHeading(message.createdAt)},{" "}
              {formatTime(message.createdAt)}
            </p>

            {/* Without this the empty canvas below reads as a failed load. */}
            {cleared && <p>{message.senderName} cleared the screen.</p>}
          </div>

          {/* The stored bytes are the uploaded bytes, and the canvas is the same
              800x440 the device draws on, so this is the screen's own picture. */}
          <BitmapCanvas
            bitmap={toBase64(message.bitmap)}
            className="max-w-3xl"
          />
        </>
      )}
    </>
  );
}
