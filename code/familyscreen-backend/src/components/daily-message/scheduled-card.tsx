"use client";

import { RefreshCw } from "lucide-react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { regenerateDailyMessage } from "@/lib/daily-message/actions";
import type {
  DailyMessageSlot,
  getScheduledDailyMessages,
} from "@/lib/daily-message/queries";
import { cn } from "@/lib/utils";

type ScheduledEntry = Awaited<
  ReturnType<typeof getScheduledDailyMessages>
>[DailyMessageSlot];

type ScheduledCardProps = {
  slot: DailyMessageSlot;
  label: string;
  /** Formatted on the server, so this island never reads a clock of its own. */
  date: string;
  entry: ScheduledEntry;
};

/**
 * What the screen shows that day. Tomorrow is already written, which is the
 * point of the day-ahead generation: there is an evening to read it and ask
 * for another one before it reaches the wall.
 *
 * A client component only for the regenerate button: that one call waits on
 * the weather, the calendar and the model, which is seconds of a plain form
 * post looking like a page that ignored the click.
 */
export function ScheduledCard({
  slot,
  label,
  date,
  entry,
}: ScheduledCardProps) {
  const [result, formAction, pending] = useActionState(
    regenerateDailyMessage,
    undefined,
  );

  return (
    <article className="flex flex-col rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-medium">{label}</h2>
          <p className="text-xs text-neutral-500">{date}</p>
        </div>
        <form action={formAction}>
          <input type="hidden" name="slot" value={slot} />
          {/* Disabled while it runs, so a second click cannot reject the line
              the first one is still writing. */}
          <Button type="submit" size="sm" variant="outline" disabled={pending}>
            <RefreshCw
              aria-hidden="true"
              className={cn(pending && "animate-spin")}
            />
            {pending ? "Regenerating" : "Regenerate"}
          </Button>
        </form>
      </div>

      {/* The old text stays readable while the new one is written: it is still
          what the wall is showing until the action commits. */}
      <div
        aria-busy={pending}
        className={cn("transition-opacity", pending && "opacity-40")}
      >
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
      </div>

      {pending && (
        <p aria-live="polite" className="mt-3 text-xs text-neutral-500">
          Writing a line for this day — the model takes a few seconds.
        </p>
      )}

      {/* Hidden while the next attempt runs: the previous result is still the
          state useActionState holds until that one resolves. */}
      {!pending && result && "error" in result && (
        <p role="alert" className="mt-3 text-xs text-destructive">
          {result.error}
        </p>
      )}
    </article>
  );
}
