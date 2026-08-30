import { DateTime } from "luxon";
import ical from "node-ical";

import { local, TIME_ZONE } from "./calendar";

/** Austrian public holidays: something real to look at until a household feed is set. */
const TEST_FEED =
  "https://calendar.google.com/calendar/ical/de.austrian%23holiday%40group.v.calendar.google.com/public/basic.ics";

const REVALIDATE_SECONDS = 900;

type Entry = { sortKey: string; line: string };

/** An invalid date matches no day, which is the harmless way to fail here. */
function isoDate(date: DateTime) {
  return date.toISODate() ?? "";
}

/** SUMMARY may carry parameters, in which case the text sits in val. */
function text(value: string | { val: string }) {
  return typeof value === "string" ? value : value.val;
}

/** node-ical builds date-only values as local midnight, so read them back that way. */
function calendarDate(date: Date) {
  return isoDate(DateTime.fromJSDate(date));
}

function inVienna(date: Date) {
  return DateTime.fromJSDate(date, { zone: TIME_ZONE });
}

/** The events of one day, as the lines the day cell prints. */
export function eventsOn(ics: string, date: Date) {
  const today = local(date);
  const day = isoDate(today);

  const entries: Entry[] = [];

  const addTimed = (start: Date, summary: string) => {
    const time = inVienna(start).toFormat("HH:mm");

    entries.push({ sortKey: time, line: `${time} ${summary}` });
  };

  for (const component of Object.values(ical.sync.parseICS(ics))) {
    if (!component || component.type !== "VEVENT" || !component.summary) {
      continue;
    }

    const summary = text(component.summary);

    if (component.rrule) {
      // between() ignores EXDATE, so the exclusions are applied here.
      const excluded = new Set(
        Object.values(component.exdate ?? {}).map((excludedDate) =>
          new Date(excludedDate).getTime(),
        ),
      );

      const occurrences = component.rrule.between(
        today.startOf("day").toJSDate(),
        today.endOf("day").toJSDate(),
        true,
      );

      for (const occurrence of occurrences) {
        if (!excluded.has(occurrence.getTime())) {
          addTimed(occurrence, summary);
        }
      }

      continue;
    }

    if (component.datetype === "date") {
      // All day, and DTEND is the first day *after* the event.
      const start = calendarDate(component.start);
      const end = component.end ? calendarDate(component.end) : start;

      if (day === start || (day > start && day < end)) {
        entries.push({ sortKey: "", line: summary });
      }

      continue;
    }

    if (isoDate(inVienna(component.start)) === day) {
      addTimed(component.start, summary);
    }
  }

  return entries
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
    .map((entry) => entry.line);
}

/** Today's entries from the configured iCal feed. */
export async function getEvents(date: Date) {
  // An empty variable counts as unset, so a blank line in .env is not a broken URL.
  const feed = process.env.CALENDAR_ICS_URL?.trim() || TEST_FEED;

  const response = await fetch(feed, {
    next: { revalidate: REVALIDATE_SECONDS },
  });

  if (!response.ok) {
    throw new Error(`Calendar request failed: ${response.status}`);
  }

  return eventsOn(await response.text(), date);
}
