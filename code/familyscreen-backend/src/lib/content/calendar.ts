import { DateTime, Info } from "luxon";

export const TIME_ZONE = "Europe/Vienna";
const LOCALE = "de-AT";

/** The instant as it reads in Vienna, which is what the screen shows. */
export function local(date: Date) {
  return DateTime.fromJSDate(date, { zone: TIME_ZONE }).setLocale(LOCALE);
}

/** Monday first, the way a German wall calendar reads. */
export const WEEKDAY_LABELS = Info.weekdays("short", { locale: LOCALE });

export function formatTime(date: Date) {
  return local(date).toFormat("HH:mm");
}

export function formatDayHeading(date: Date) {
  return local(date).toFormat("ccc d. LLLL");
}

/**
 * The month as calendar rows, Monday first, padded with nulls so every week has
 * seven cells.
 */
export function monthGrid(date: Date) {
  const today = local(date);
  const first = today.startOf("month");

  const cells: (number | null)[] = [
    ...Array<null>(first.weekday - 1).fill(null),
    ...Array.from({ length: first.daysInMonth ?? 0 }, (_, index) => index + 1),
  ];

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  const weeks: (number | null)[][] = [];

  for (let index = 0; index < cells.length; index += 7) {
    weeks.push(cells.slice(index, index + 7));
  }

  return { weeks, today: today.day };
}
