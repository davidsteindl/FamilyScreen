import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { auth } from "@/auth";
import { BitmapCanvas } from "@/components/bitmap-canvas";
import { buttonVariants } from "@/components/ui/button";
import { formatDayHeading, formatTime } from "@/lib/content/calendar";
import {
  currentDeviceMessageId,
  deviceMessageHistoryFor,
  deviceMessageSourceFor,
} from "@/lib/messaging/messages";
import { toBase64 } from "@/lib/screen/bitmap";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 12;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ page?: string; device?: string }>;

function historyUrl(page: number, sourceDeviceId?: string) {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  if (sourceDeviceId) params.set("device", sourceDeviceId);
  const query = params.toString();
  return query ? `/inbox/history?${query}` : "/inbox/history";
}

export default async function InboxHistoryPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    return null;
  }

  const requested = await searchParams;
  const sourceDeviceId = requested.device;

  if (sourceDeviceId && !UUID_PATTERN.test(sourceDeviceId)) {
    notFound();
  }

  const requestedPage = Number(requested.page ?? "1");
  const page = Number.isSafeInteger(requestedPage)
    ? Math.max(1, requestedPage)
    : 1;

  const [{ items, total }, currentId, sourceName] = await Promise.all([
    deviceMessageHistoryFor(session.user.id, {
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
      sourceDeviceId,
    }),
    currentDeviceMessageId(session.user.id, sourceDeviceId),
    sourceDeviceId
      ? deviceMessageSourceFor(session.user.id, sourceDeviceId)
      : Promise.resolve(null),
  ]);

  if (sourceDeviceId && !sourceName) {
    notFound();
  }

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <Link
          href="/inbox"
          className="text-sm text-neutral-500 underline underline-offset-2 hover:text-neutral-900"
        >
          Back to inbox
        </Link>

        <h1 className="mt-2 text-lg font-medium">
          {sourceName ? `${sourceName} history` : "Drawing history"}
        </h1>

        <p className="mt-2 max-w-2xl text-sm text-neutral-600">
          Every drawing this FamilyScreen has sent you, newest first. A cleared
          screen is a state, not a drawing, so it only shows in the inbox.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <Link
            key={item.id}
            href={`/inbox/${item.id}`}
            className="rounded-xl border border-neutral-200 bg-white p-3 shadow-sm transition-colors hover:border-neutral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
          >
            <BitmapCanvas bitmap={toBase64(item.bitmap)} />

            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
              {item.id === currentId && (
                <span className="rounded-full bg-neutral-100 px-2 py-1">
                  On the screen now
                </span>
              )}

              <span>
                {item.senderName} · {formatDayHeading(item.createdAt)},{" "}
                {formatTime(item.createdAt)}
              </span>
            </div>
          </Link>
        ))}
      </div>

      {items.length === 0 && (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-neutral-500">
          No drawing has arrived from this FamilyScreen yet.
        </p>
      )}

      {pageCount > 1 && (
        <nav
          aria-label="Page navigation"
          className="mt-6 flex items-center justify-between"
        >
          <Link
            href={historyUrl(Math.max(1, page - 1), sourceDeviceId)}
            aria-disabled={page <= 1}
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              page <= 1 && "pointer-events-none opacity-50",
            )}
          >
            <ChevronLeft aria-hidden="true" /> Newer
          </Link>
          <span className="text-sm text-neutral-500">
            Page {Math.min(page, pageCount)} of {pageCount}
          </span>
          <Link
            href={historyUrl(Math.min(pageCount, page + 1), sourceDeviceId)}
            aria-disabled={page >= pageCount}
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              page >= pageCount && "pointer-events-none opacity-50",
            )}
          >
            Older <ChevronRight aria-hidden="true" />
          </Link>
        </nav>
      )}
    </div>
  );
}
