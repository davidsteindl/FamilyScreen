export const TIME_ZONE = "Europe/Vienna";

/** Monday first, the way a German wall calendar reads. */
export const WEEKDAY_LABELS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

function parts(date: Date, options: Intl.DateTimeFormatOptions) {
  const formatted = new Intl.DateTimeFormat("de-AT", {
    timeZone: TIME_ZONE,
    ...options,
  }).formatToParts(date);

  return (type: Intl.DateTimeFormatPartTypes) =>
    formatted.find((part) => part.type === type)?.value ?? "";
}

/** The calendar date in Vienna, which is what the screen shows — the server runs in UTC. */
export function civilDate(date: Date) {
  const value = parts(date, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return {
    year: Number(value("year")),
    month: Number(value("month")),
    day: Number(value("day")),
  };
}

export function formatTime(date: Date) {
  const value = parts(date, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  return `${value("hour")}:${value("minute")}`;
}

export function formatDayHeading(date: Date) {
  const value = parts(date, {
    weekday: "short",
    day: "numeric",
    month: "long",
  });

  return `${value("weekday").replace(".", "")} ${value("day")}. ${value("month")}`;
}

/**
 * The month as calendar rows, Monday first, padded with nulls so every week has
 * seven cells. UTC arithmetic on the Vienna calendar date keeps it timezone-safe.
 */
export function monthGrid(date: Date) {
  const { year, month, day } = civilDate(date);

  const lead = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  const length = new Date(Date.UTC(year, month, 0)).getUTCDate();

  const cells: (number | null)[] = [
    ...Array<null>(lead).fill(null),
    ...Array.from({ length }, (_, index) => index + 1),
  ];

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  const weeks: (number | null)[][] = [];

  for (let index = 0; index < cells.length; index += 7) {
    weeks.push(cells.slice(index, index + 7));
  }

  return { weeks, today: day };
}
