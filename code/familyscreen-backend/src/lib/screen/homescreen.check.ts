// Run with: npx tsx src/lib/screen/homescreen.check.ts
import assert from "node:assert/strict";

import {
  formatDayHeading,
  formatTime,
  local,
  monthGrid,
  WEEKDAY_LABELS,
} from "../content/calendar";
import { eventsOn } from "../content/events";
import { quoteOfTheDay } from "../content/quote";
import type { Weather } from "../content/weather";
import {
  BITMAP_HEIGHT,
  BITMAP_WIDTH,
  BYTES_PER_ROW,
  toBase64,
  unpackBitmap,
} from "./bitmap";
import {
  createBitmap,
  drawText,
  fillRect,
  fitScale,
  strokeRect,
  textWidth,
  wrapText,
} from "./bitmap-render";
import { renderHomescreen } from "./homescreen";

const black = (bytes: Uint8Array, x: number, y: number) =>
  ((bytes[y * BYTES_PER_ROW + (x >> 3)] >> (7 - (x & 7))) & 1) === 1;

// Mirrors the layout constants in homescreen.ts. The point is to notice when
// they move, so the check states them itself instead of importing them.
const MARGIN = 12;
const WEATHER_TO = 310;
const CALENDAR_FROM = 312;
const CALENDAR_TO = 580;
const QUOTE_FROM = 582;
const MONTH_FROM_Y = 215;
const TODAY_TOP = 76;
const TODAY_BOTTOM = 201;

//
// GLYPHS AND TEXT METRICS
//

const glyphs = createBitmap();

// "1" occupies columns 1 and 2 of its five wide slot, so its left column stays clear.
drawText(glyphs, "1", 10, 20, 1);
assert.equal(black(glyphs.bytes, 10, 20), false);
assert.equal(black(glyphs.bytes, 12, 20), true);
assert.equal(black(glyphs.bytes, 11, 21), true);

// An unknown character draws nothing at all rather than a placeholder box.
drawText(glyphs, "©", 100, 100, 4);
assert.equal(
  glyphs.bytes.subarray(90 * BYTES_PER_ROW).every((byte) => byte === 0),
  true,
);

// Umlauts are spelled out, other diacritics are dropped: both change the width.
assert.equal(textWidth("Zoë", 2), textWidth("Zoe", 2));
assert.equal(textWidth("Ä", 1), textWidth("AE", 1));
assert.equal(textWidth("ß", 1), textWidth("SS", 1));
assert.equal(textWidth("", 3), 0);

assert.equal(fitScale("AA", 24, 10), 2);
assert.equal(fitScale("AA", 24, 1), 1);
assert.equal(fitScale("AAAA", 6, 10), 1); // never returns 0, however tight the box
assert.equal(fitScale("", 24, 5), 5);

//
// SHAPES
//

const rect = createBitmap();
fillRect(rect, 5, 5, 3, 2);
assert.equal(black(rect.bytes, 5, 5), true);
assert.equal(black(rect.bytes, 7, 6), true);
assert.equal(black(rect.bytes, 8, 6), false);
assert.equal(black(rect.bytes, 7, 7), false);

const outline = createBitmap();
strokeRect(outline, 20, 20, 10, 8, 1);
assert.equal(black(outline.bytes, 20, 20), true);
assert.equal(black(outline.bytes, 29, 27), true);
assert.equal(black(outline.bytes, 25, 24), false); // hollow inside
assert.equal(black(outline.bytes, 30, 28), false); // nothing past the edge

//
// WORD WRAP
//

assert.deepEqual(wrapText("GEFRIERENDER SPRUEHREGEN", 330, 3), [
  "GEFRIERENDER",
  "SPRUEHREGEN",
]);
assert.deepEqual(wrapText("UEBERWIEGEND KLAR", 330, 3), ["UEBERWIEGEND KLAR"]);

for (const line of wrapText("GEWITTER MIT HAGEL", 160, 2)) {
  assert.ok(textWidth(line, 2) <= 160, `wrapped line too wide: ${line}`);
}

//
// WIRE FORMAT
//

assert.equal(toBase64(new Uint8Array([0, 1, 2])), "AAEC");
assert.equal(toBase64(new Uint8Array(0)), "");
assert.deepEqual(
  Uint8Array.from(atob(toBase64(rect.bytes)), (character) =>
    character.charCodeAt(0),
  ),
  rect.bytes,
);

// A set bit is ink, and the preview paints ink as black on an opaque canvas.
const rgba = unpackBitmap(rect.bytes);
assert.equal(rgba[(5 * BITMAP_WIDTH + 5) * 4], 0);
assert.equal(rgba[(5 * BITMAP_WIDTH + 5) * 4 + 3], 255);
assert.equal(rgba[0], 255);

//
// CALENDAR
//

// The server runs in UTC, the screen shows Vienna: 23:30Z in August is tomorrow.
assert.equal(local(new Date("2026-08-30T21:00:00Z")).day, 30);
assert.equal(local(new Date("2026-08-30T23:30:00Z")).day, 31);
assert.equal(formatTime(new Date("2026-08-30T21:00:00Z")), "23:00");

const heading = formatDayHeading(new Date("2026-08-30T10:00:00Z"));
assert.ok(heading.startsWith("So "), heading); // weekday, trailing dot stripped
assert.ok(heading.includes("30."), heading);
assert.ok(heading.includes("August"), heading);

assert.equal(WEEKDAY_LABELS.length, 7);

const grid = monthGrid(new Date("2026-08-30T10:00:00Z"));
assert.ok(
  grid.weeks.every((week) => week.length === 7),
  "every week needs seven cells",
);
assert.deepEqual(
  grid.weeks.flat().filter((day) => day !== null),
  Array.from({ length: 31 }, (_, index) => index + 1),
);
assert.equal(grid.weeks[0][5], 1); // 1 August 2026 is a Saturday
assert.equal(grid.weeks[0][4], null);
assert.equal(grid.today, 30);

//
// EVENTS
//

// One fixture covering every shape the day cell has to survive.
const FIXTURE = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "BEGIN:VEVENT",
  "UID:allday",
  "DTSTART;VALUE=DATE:20260830",
  "DTEND;VALUE=DATE:20260831",
  "SUMMARY:Geburtstag Oma",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:span",
  "DTSTART;VALUE=DATE:20260829",
  "DTEND;VALUE=DATE:20260901",
  "SUMMARY:Urlaub",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:timed",
  "DTSTART;TZID=Europe/Vienna:20260830T153000",
  "DTEND;TZID=Europe/Vienna:20260830T163000",
  "SUMMARY:Kaffee",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:early",
  "DTSTART;TZID=Europe/Vienna:20260830T090000",
  "DTEND;TZID=Europe/Vienna:20260830T093000",
  "SUMMARY:Arzt",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:other-day",
  "DTSTART;TZID=Europe/Vienna:20260831T090000",
  "DTEND;TZID=Europe/Vienna:20260831T093000",
  "SUMMARY:Morgen",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:weekly",
  "DTSTART;TZID=Europe/Vienna:20260803T080000",
  "DTEND;TZID=Europe/Vienna:20260803T083000",
  "RRULE:FREQ=WEEKLY;BYDAY=MO",
  "EXDATE;TZID=Europe/Vienna:20260817T080000",
  "SUMMARY:Wochenmarkt",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

// All day first, then by time; the next day's entry stays out.
assert.deepEqual(eventsOn(FIXTURE, new Date("2026-08-30T10:00:00Z")), [
  "Geburtstag Oma",
  "Urlaub",
  "09:00 Arzt",
  "15:30 Kaffee",
]);

// A recurring event shows up on its weekday.
assert.deepEqual(eventsOn(FIXTURE, new Date("2026-08-24T10:00:00Z")), [
  "08:00 Wochenmarkt",
]);

// ...but not on the date its EXDATE excludes.
assert.deepEqual(eventsOn(FIXTURE, new Date("2026-08-17T10:00:00Z")), []);

// A day with nothing on it is empty, not an error.
assert.deepEqual(eventsOn(FIXTURE, new Date("2026-08-19T10:00:00Z")), []);

//
// QUOTE
//

const morning = new Date("2026-08-30T06:00:00Z");
assert.equal(
  quoteOfTheDay(morning),
  quoteOfTheDay(new Date("2026-08-30T18:00:00Z")),
);
assert.notEqual(
  quoteOfTheDay(morning),
  quoteOfTheDay(new Date("2026-08-31T06:00:00Z")),
);

// The 5x7 font has no comma, so no saying may contain one.
for (let offset = 0; offset < 10; offset++) {
  const quote = quoteOfTheDay(new Date(Date.UTC(2026, 0, 1 + offset, 12)));
  assert.ok(quote.length > 0);
  assert.ok(!quote.includes(","), `quote has a comma: ${quote}`);
}

//
// HOMESCREEN
//

const ottenschlag: Weather = {
  location: "Ottenschlag",
  temperature: -3.4,
  high: 26.5,
  low: 14.2,
  description: "LEICHT BEWOELKT",
};

const wien: Weather = {
  location: "Wien",
  temperature: 25.9,
  high: 30.1,
  low: 18.3,
  description: "UEBERWIEGEND KLAR",
};

const renderedAt = new Date("2026-08-30T10:00:00Z");
const screen = { renderedAt, primary: ottenschlag, secondary: wien };

const base = renderHomescreen({ ...screen, events: [] });

assert.equal(base.length, BYTES_PER_ROW * BITMAP_HEIGHT);

// Same input, same bytes: rendering twice may not drift.
assert.deepEqual(renderHomescreen({ ...screen, events: [] }), base);

// A different minute must change the screen, or something reads the wall clock
// instead of renderedAt and the stamp would lie about when this was drawn.
assert.notDeepEqual(
  renderHomescreen({
    ...screen,
    renderedAt: new Date("2026-08-30T10:31:00Z"),
    events: [],
  }),
  base,
);

/** Nothing may be drawn in the margin band outside the frame. */
const assertInsideFrame = (drawn: Uint8Array, label: string) => {
  for (let y = 0; y < BITMAP_HEIGHT; y++) {
    for (const x of [0, MARGIN - 1, BITMAP_WIDTH - MARGIN, BITMAP_WIDTH - 1]) {
      assert.equal(
        black(drawn, x, y),
        false,
        `${label}: ink outside the frame at ${x},${y}`,
      );
    }
  }

  for (let x = 0; x < BITMAP_WIDTH; x++) {
    for (const y of [0, MARGIN - 1, BITMAP_HEIGHT - MARGIN, BITMAP_HEIGHT - 1]) {
      assert.equal(
        black(drawn, x, y),
        false,
        `${label}: ink outside the frame at ${x},${y}`,
      );
    }
  }
};

/** Pixel by pixel, because a column edge need not fall on a byte boundary. */
const sameRegion = (
  a: Uint8Array,
  b: Uint8Array,
  bounds: { x0: number; x1: number; y0: number; y1: number },
  label: string,
) => {
  for (let y = bounds.y0; y < bounds.y1; y++) {
    for (let x = bounds.x0; x < bounds.x1; x++) {
      assert.equal(black(a, x, y), black(b, x, y), `${label} at ${x},${y}`);
    }
  }
};

const inkIn = (
  drawn: Uint8Array,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
) => {
  let count = 0;

  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (black(drawn, x, y)) {
        count++;
      }
    }
  }

  return count;
};

assertInsideFrame(base, "empty day");

// The frame itself is drawn, just inside the margin on every side.
assert.equal(black(base, MARGIN, MARGIN), true);
assert.equal(
  black(base, BITMAP_WIDTH - MARGIN - 1, BITMAP_HEIGHT - MARGIN - 1),
  true,
);

// An empty day still says so rather than leaving the cell blank.
assert.ok(
  inkIn(base, CALENDAR_FROM, TODAY_TOP, CALENDAR_TO, TODAY_BOTTOM) > 0,
  "expected an empty state in the appointments cell",
);

// The longest conditions and widest temperatures stay in the weather column.
const wide = renderHomescreen({
  renderedAt,
  primary: {
    ...ottenschlag,
    temperature: -13.6,
    high: -11.2,
    low: -18.7,
    description: "GEFRIERENDER SPRUEHREGEN",
  },
  secondary: {
    ...wien,
    temperature: -11.2,
    description: "GEFRIERENDER SPRUEHREGEN",
  },
  events: [],
});

assertInsideFrame(wide, "longest conditions");
sameRegion(
  base,
  wide,
  { x0: CALENDAR_FROM, x1: BITMAP_WIDTH, y0: 0, y1: BITMAP_HEIGHT },
  "weather bled out of its column",
);

// More appointments than fit are dropped, not run past the cell.
const busy = renderHomescreen({
  ...screen,
  events: [
    "Arzttermin um 9 Uhr",
    "Einkaufen mit Oma",
    "Mittagessen bei Familie Huber",
    "Spaziergang im Park",
    "Abendessen um 18 Uhr",
    "Telefonat mit Tobias",
    "Fernsehabend",
    "Noch ein Termin",
  ],
});

assertInsideFrame(busy, "many events");
assert.ok(
  inkIn(busy, CALENDAR_FROM, TODAY_TOP, CALENDAR_TO, TODAY_BOTTOM) >
    inkIn(base, CALENDAR_FROM, TODAY_TOP, CALENDAR_TO, TODAY_BOTTOM),
  "expected the appointments to be drawn",
);
sameRegion(
  base,
  busy,
  { x0: 0, x1: WEATHER_TO, y0: 0, y1: BITMAP_HEIGHT },
  "events bled into the weather column",
);
sameRegion(
  base,
  busy,
  { x0: QUOTE_FROM, x1: BITMAP_WIDTH, y0: 0, y1: BITMAP_HEIGHT },
  "events bled into the quote column",
);
sameRegion(
  base,
  busy,
  { x0: CALENDAR_FROM, x1: CALENDAR_TO, y0: MONTH_FROM_Y, y1: BITMAP_HEIGHT },
  "events overflowed into the month grid",
);

console.log("homescreen check ok");
