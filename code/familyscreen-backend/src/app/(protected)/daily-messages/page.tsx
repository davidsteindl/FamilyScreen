import {
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  RefreshCw,
  X,
} from "lucide-react";
import Link from "next/link";

import { CreateDailyMessageForm } from "@/components/daily-message/create-form";
import { DeleteDailyMessageForm } from "@/components/daily-message/delete-form";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DAILY_MESSAGE_MAX_LENGTH,
  type DailyMessageStatus,
} from "@/lib/daily-message/rules";
import {
  regenerateDailyMessage,
  reviewDailyMessage,
} from "@/lib/daily-message/actions";
import {
  dailyMessageCounts,
  getScheduledDailyMessages,
  listDailyMessages,
  type DailyMessageSlot,
} from "@/lib/daily-message/queries";
import { viennaDateKey, viennaNextDateKey } from "@/lib/daily-message/selection";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;
const STATUSES = ["pending", "approved", "rejected"] as const;

export const dynamic = "force-dynamic";

const LABELS: Record<DailyMessageStatus | "all", string> = {
  all: "All",
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

type SearchParams = Promise<{ status?: string; page?: string }>;

function reviewUrl(status: DailyMessageStatus | "all", page = 1) {
  const params = new URLSearchParams();

  if (status !== "pending") {
    params.set("status", status);
  }

  if (page > 1) {
    params.set("page", String(page));
  }

  const query = params.toString();
  return `/daily-messages${query ? `?${query}` : ""}`;
}

const DAY_FORMAT = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "full",
  timeZone: "Europe/Vienna",
});

type ScheduledEntry = Awaited<
  ReturnType<typeof getScheduledDailyMessages>
>[DailyMessageSlot];

/**
 * What the screen shows that day. Tomorrow is already written, which is the
 * point of the day-ahead generation: there is an evening to read it and ask
 * for another one before it reaches the wall.
 */
function ScheduledCard({
  slot,
  label,
  dateKey,
  entry,
}: {
  slot: DailyMessageSlot;
  label: string;
  dateKey: string;
  entry: ScheduledEntry;
}) {
  return (
    <article className="flex flex-col rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-medium">{label}</h2>
          <p className="text-xs text-neutral-500">
            {DAY_FORMAT.format(new Date(`${dateKey}T12:00:00Z`))}
          </p>
        </div>
        <form action={regenerateDailyMessage}>
          <input type="hidden" name="slot" value={slot} />
          <Button type="submit" size="sm" variant="outline">
            <RefreshCw aria-hidden="true" /> Regenerate
          </Button>
        </form>
      </div>

      {entry ? (
        <>
          <p className="text-lg leading-relaxed text-neutral-900">
            {entry.text}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
            <span className="rounded-full bg-neutral-100 px-2 py-1">
              {entry.category}
            </span>
            {entry.reviewNote && <span>{entry.reviewNote}</span>}
            <span>{entry.sourceName ?? "from the approved pool"}</span>
          </div>
        </>
      ) : (
        <p className="text-sm text-neutral-500">
          Written on the next device poll, or now with Regenerate.
        </p>
      )}
    </article>
  );
}

async function loadReviewData(
  status: DailyMessageStatus | "all",
  page: number,
) {
  try {
    const [items, totals, scheduled] = await Promise.all([
      listDailyMessages(status, PAGE_SIZE, (page - 1) * PAGE_SIZE),
      dailyMessageCounts(),
      getScheduledDailyMessages(),
    ]);

    return { items, totals, scheduled };
  } catch (error) {
    return { error };
  }
}

export default async function DailyMessagesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const requested = await searchParams;
  const status = (
    requested.status === "all" || STATUSES.includes(requested.status as never)
      ? requested.status
      : "pending"
  ) as DailyMessageStatus | "all";
  const requestedPage = Number(requested.page ?? "1");
  const page = Number.isSafeInteger(requestedPage)
    ? Math.max(1, requestedPage)
    : 1;

  const result = await loadReviewData(status, page);

  if ("error" in result) {
    const { error } = result;

    return (
      <>
        <h1 className="text-lg font-medium">Review daily messages</h1>
        <p className="mt-4 max-w-xl rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          The daily messages table is not reachable. Run the usual database
          migration first.
        </p>
        {process.env.NODE_ENV === "development" && error instanceof Error && (
          <p className="mt-3 font-mono text-xs text-neutral-500">{error.message}</p>
        )}
      </>
    );
  }

  const { items, totals, scheduled } = result;
  const now = new Date();
  const today = viennaDateKey(now) ?? "";
  const tomorrow = viennaNextDateKey(now) ?? "";
  const counts = new Map(totals.map((item) => [item.status, item.value]));
  const allCount = totals.reduce((sum, item) => sum + item.value, 0);
  const filteredCount = status === "all" ? allCount : (counts.get(status) ?? 0);
  const pageCount = Math.max(1, Math.ceil(filteredCount / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <h1 className="text-lg font-medium">Review daily messages</h1>
        <p className="mt-2 max-w-2xl text-sm text-neutral-600">
          Only entries that were explicitly approved can reach the FamilyScreen.
          Every text is capped at {DAILY_MESSAGE_MAX_LENGTH} characters and is
          checked against the device font before it is stored.
        </p>
      </div>

      <section aria-label="Scheduled" className="mb-6 grid gap-4 sm:grid-cols-2">
        <ScheduledCard
          slot="today"
          label="Today"
          dateKey={today}
          entry={scheduled.today}
        />
        <ScheduledCard
          slot="tomorrow"
          label="Tomorrow"
          dateKey={tomorrow}
          entry={scheduled.tomorrow}
        />
      </section>

      {/* Native disclosure: writing is the rarer of the two jobs on this page,
          and a <details> needs no state to stay out of the way. */}
      <details className="mb-6 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
        <summary className="cursor-pointer text-sm font-medium">
          Write your own daily message
        </summary>
        <div className="mt-4">
          <CreateDailyMessageForm />
        </div>
      </details>

      <nav aria-label="Filter entries" className="mb-6 flex flex-wrap gap-2">
        {(["pending", "approved", "rejected", "all"] as const).map(
          (filter) => {
            const value =
              filter === "all" ? allCount : (counts.get(filter) ?? 0);

            return (
              <Link
                key={filter}
                href={reviewUrl(filter)}
                aria-current={filter === status ? "page" : undefined}
                className={cn(
                  buttonVariants({
                    variant: filter === status ? "default" : "outline",
                    size: "sm",
                  }),
                )}
              >
                {LABELS[filter]} {value}
              </Link>
            );
          },
        )}
      </nav>

      <div className="space-y-3">
        {items.map((item) => (
          <article
            key={item.id}
            className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm"
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                  <span className="rounded-full bg-neutral-100 px-2 py-1">
                    {item.category}
                  </span>
                  <span>{item.text.length}/{DAILY_MESSAGE_MAX_LENGTH} characters</span>
                  <span>{LABELS[item.status as DailyMessageStatus]}</span>
                </div>

                <p className="text-lg leading-relaxed text-neutral-900">
                  {item.text}
                </p>

                {item.sourceUrl && (
                  <a
                    className="mt-3 inline-flex items-center gap-1 text-xs text-neutral-500 underline underline-offset-2 hover:text-neutral-900"
                    href={item.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Inspiration: {item.sourceName ?? item.sourceUrl}
                    <ExternalLink aria-hidden="true" className="size-3" />
                  </a>
                )}

                {item.reviewNote && (
                  <p className="mt-2 text-xs text-neutral-500">
                    {item.reviewNote}
                  </p>
                )}

                {item.reviewedAt && (
                  <p className="mt-2 text-xs text-neutral-400">
                    Reviewed by {item.reviewedByName ?? "Unknown"} on{" "}
                    {new Intl.DateTimeFormat("en-GB", {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: "Europe/Vienna",
                    }).format(item.reviewedAt)}
                  </p>
                )}
              </div>

              <div className="flex shrink-0 gap-2">
                <form action={reviewDailyMessage}>
                  <input type="hidden" name="id" value={item.id} />
                  <input type="hidden" name="decision" value="approved" />
                  <Button
                    type="submit"
                    size="sm"
                    variant={item.status === "approved" ? "secondary" : "default"}
                    disabled={item.status === "approved"}
                  >
                    <Check aria-hidden="true" /> Approve
                  </Button>
                </form>
                <form action={reviewDailyMessage}>
                  <input type="hidden" name="id" value={item.id} />
                  <input type="hidden" name="decision" value="rejected" />
                  <Button
                    type="submit"
                    size="sm"
                    variant="outline"
                    disabled={item.status === "rejected"}
                  >
                    <X aria-hidden="true" /> Reject
                  </Button>
                </form>
                {item.status === "rejected" && (
                  <DeleteDailyMessageForm id={item.id} />
                )}
              </div>
            </div>
          </article>
        ))}

        {items.length === 0 && (
          <p className="rounded-xl border border-dashed p-8 text-center text-sm text-neutral-500">
            No entries match this filter.
          </p>
        )}
      </div>

      {pageCount > 1 && (
        <nav
          aria-label="Pagination"
          className="mt-6 flex items-center justify-between"
        >
          <Link
            href={reviewUrl(status, Math.max(1, page - 1))}
            aria-disabled={page <= 1}
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              page <= 1 && "pointer-events-none opacity-50",
            )}
          >
            <ChevronLeft aria-hidden="true" /> Previous
          </Link>
          <span className="text-sm text-neutral-500">
            Page {Math.min(page, pageCount)} of {pageCount}
          </span>
          <Link
            href={reviewUrl(status, Math.min(pageCount, page + 1))}
            aria-disabled={page >= pageCount}
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              page >= pageCount && "pointer-events-none opacity-50",
            )}
          >
            Next <ChevronRight aria-hidden="true" />
          </Link>
        </nav>
      )}
    </div>
  );
}
