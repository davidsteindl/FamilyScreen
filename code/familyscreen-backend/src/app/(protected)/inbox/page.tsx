import Link from "next/link";

import { auth } from "@/auth";
import { AutoRefresh } from "@/components/auto-refresh";
import { BitmapCanvas } from "@/components/bitmap-canvas";
import { buttonVariants } from "@/components/ui/button";
import { formatDayHeading, formatTime } from "@/lib/content/calendar";
import { latestDeviceMessagesFor } from "@/lib/messaging/messages";
import { isBlankBitmap, toBase64 } from "@/lib/screen/bitmap";

export default async function InboxPage() {
  const session = await auth();

  if (!session?.user?.id) {
    return null;
  }

  const messages = await latestDeviceMessagesFor(session.user.id);

  return (
    <>
      <h1 className="mb-6 text-lg font-medium">Inbox</h1>

      <AutoRefresh seconds={20} />

      {messages.length === 0 ? (
        <p className="text-sm text-neutral-500">
          No drawing has arrived from a FamilyScreen yet.
        </p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {messages.map((message) => {
            const cleared = isBlankBitmap(message.bitmap);

            return (
              <article
                key={message.sourceDeviceId}
                className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm"
              >
                <div className="mb-3 text-sm text-neutral-500">
                  <h2 className="font-medium text-neutral-900">
                    {message.senderName}
                  </h2>
                  <p>
                    {formatDayHeading(message.createdAt)},{" "}
                    {formatTime(message.createdAt)}
                  </p>
                  {cleared && <p>The screen was cleared.</p>}
                </div>

                <Link href={`/inbox/${message.id}`}>
                  <BitmapCanvas bitmap={toBase64(message.bitmap)} />
                </Link>

                <Link
                  href={`/inbox/history?device=${message.sourceDeviceId}`}
                  className={buttonVariants({
                    variant: "outline",
                    size: "sm",
                    className: "mt-4",
                  })}
                >
                  View {message.senderName} history
                </Link>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
