import { asc, count, desc, eq } from "drizzle-orm";
import { Check, ChevronLeft, ChevronRight, ExternalLink, X } from "lucide-react";
import Link from "next/link";

import { Button, buttonVariants } from "@/components/ui/button";
import { db } from "@/db";
import { DeleteDailyMessageForm } from "@/features/daily-message/delete-message-form";
import { cn } from "@/lib/utils";
import { reviewDailyMessage } from "@/features/daily-message/review-actions";
import { dailyMessages } from "@/features/daily-message/schema";
import {
  DAILY_MESSAGE_MAX_LENGTH,
  type DailyMessageStatus,
} from "@/features/daily-message/validation";

const PAGE_SIZE = 20;
const STATUSES = ["pending", "approved", "rejected"] as const;

export const dynamic = "force-dynamic";

const LABELS: Record<DailyMessageStatus | "all", string> = {
  all: "Alle",
  pending: "Offen",
  approved: "Freigegeben",
  rejected: "Abgelehnt",
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

async function loadReviewData(
  status: DailyMessageStatus | "all",
  page: number,
) {
  try {
    const where = status === "all" ? undefined : eq(dailyMessages.status, status);
    const [items, totals] = await Promise.all([
      db
        .select()
        .from(dailyMessages)
        .where(where)
        .orderBy(asc(dailyMessages.createdAt), asc(dailyMessages.id))
        .limit(PAGE_SIZE)
        .offset((page - 1) * PAGE_SIZE),
      db
        .select({ status: dailyMessages.status, value: count() })
        .from(dailyMessages)
        .groupBy(dailyMessages.status)
        .orderBy(desc(dailyMessages.status)),
    ]);

    return { items, totals };
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
      <main className="flex-1 p-8">
        <h1 className="text-xl font-semibold">Tagesinhalte prüfen</h1>
        <p className="mt-4 max-w-xl rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Die Tabelle für Tagesinhalte ist nicht erreichbar. Bitte zuerst die
          normale Datenbankmigration ausführen.
        </p>
        {process.env.NODE_ENV === "development" && error instanceof Error && (
          <p className="mt-3 font-mono text-xs text-neutral-500">{error.message}</p>
        )}
      </main>
    );
  }

  const { items, totals } = result;
  const counts = new Map(totals.map((item) => [item.status, item.value]));
  const allCount = totals.reduce((sum, item) => sum + item.value, 0);
  const filteredCount = status === "all" ? allCount : (counts.get(status) ?? 0);
  const pageCount = Math.max(1, Math.ceil(filteredCount / PAGE_SIZE));

  return (
      <main className="min-w-0 flex-1 p-8">
        <div className="mx-auto max-w-5xl">
          <div className="mb-6">
            <h1 className="text-xl font-semibold">Tagesinhalte prüfen</h1>
            <p className="mt-2 max-w-2xl text-sm text-neutral-600">
              Nur ausdrücklich freigegebene Einträge können am FamilyScreen
              erscheinen. Jeder Text ist auf {DAILY_MESSAGE_MAX_LENGTH} Zeichen
              begrenzt und wird vor dem Import auf den Gerätezeichensatz geprüft.
            </p>
          </div>

          <nav aria-label="Inhalte filtern" className="mb-6 flex flex-wrap gap-2">
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
                      <span>{item.text.length}/{DAILY_MESSAGE_MAX_LENGTH} Zeichen</span>
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

                    {item.reviewedAt && (
                      <p className="mt-2 text-xs text-neutral-400">
                        Geprüft von {item.reviewedByName ?? "Unbekannt"} am{" "}
                        {new Intl.DateTimeFormat("de-AT", {
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
                        <Check aria-hidden="true" /> Freigeben
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
                        <X aria-hidden="true" /> Ablehnen
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
                In diesem Filter gibt es keine Einträge.
              </p>
            )}
          </div>

          {pageCount > 1 && (
            <nav
              aria-label="Seitennavigation"
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
                <ChevronLeft aria-hidden="true" /> Zurück
              </Link>
              <span className="text-sm text-neutral-500">
                Seite {Math.min(page, pageCount)} von {pageCount}
              </span>
              <Link
                href={reviewUrl(status, Math.min(pageCount, page + 1))}
                aria-disabled={page >= pageCount}
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  page >= pageCount && "pointer-events-none opacity-50",
                )}
              >
                Weiter <ChevronRight aria-hidden="true" />
              </Link>
            </nav>
          )}
        </div>
      </main>
  );
}
