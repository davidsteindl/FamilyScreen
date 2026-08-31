import Link from "next/link";
import { notFound } from "next/navigation";

import { auth } from "@/auth";
import { BitmapCanvas } from "@/components/bitmap-canvas";
import { formatDayHeading, formatTime } from "@/lib/content/calendar";
import { deviceMessageFor } from "@/lib/messages";
import { isBlankBitmap, toBase64 } from "@/lib/screen/bitmap";

export const dynamic = "force-dynamic";

export default async function InboxMessagePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();

  // (protected)/layout.tsx redirects, but this still runs alongside it, so bail
  // rather than assert: without a session there is nothing to render anyway.
  if (!session?.user?.id) {
    return null;
  }

  const id = Number((await params).id);

  if (!Number.isSafeInteger(id)) {
    notFound();
  }

  // Scoped to this recipient inside the query, so a guessed id is a 404 rather
  // than someone else's family on screen.
  const message = await deviceMessageFor(session.user.id, id);

  if (!message) {
    notFound();
  }

  const cleared = isBlankBitmap(message.bitmap);

  return (
    <>
      <Link
        href="/inbox/history"
        className="text-sm text-neutral-500 underline underline-offset-2 hover:text-neutral-900"
      >
        Back to history
      </Link>

      <div className="mt-4 mb-4 text-sm text-neutral-500">
        <p>
          From {message.senderName} · {formatDayHeading(message.createdAt)},{" "}
          {formatTime(message.createdAt)}
        </p>

        {/* Without this the empty canvas below reads as a failed load. */}
        {cleared && <p>{message.senderName} cleared the screen.</p>}
      </div>

      <BitmapCanvas bitmap={toBase64(message.bitmap)} className="max-w-3xl" />
    </>
  );
}
