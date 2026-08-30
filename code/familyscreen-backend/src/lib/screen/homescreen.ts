import {
  drawText,
  fillRect,
  fitScale,
  strokeRect,
  textWidth,
  wrapText,
  type Bitmap,
} from "./bitmap-render";
import {
  createScreen,
  drawRight,
  drawTextBlock,
  inset,
  lineHeight,
  BODY_Y,
  LINE_GAP,
  BORDER,
  HEADER,
  INNER_BOTTOM,
  INNER_X,
  PAD,
  type Box,
} from "./layout";
import {
  formatDayHeading,
  formatTime,
  monthGrid,
  WEEKDAY_LABELS,
} from "../content/calendar";
import type { Weather } from "../content/weather";

const BLOCK_GAP = 14;

const WEATHER_WIDTH = 296;
const CALENDAR_WIDTH = 268;
const QUOTE_WIDTH = 204;

const CALENDAR_X = INNER_X + WEATHER_WIDTH + BORDER;
const QUOTE_X = CALENDAR_X + CALENDAR_WIDTH + BORDER;

/** The two column splits sit at different heights, the way the mockup draws them. */
const WEATHER_SPLIT_Y = 233;
const CALENDAR_SPLIT_Y = 213;

const WEATHER_TOP: Box = {
  x: INNER_X,
  y: BODY_Y,
  width: WEATHER_WIDTH,
  height: WEATHER_SPLIT_Y - BODY_Y,
};

const WEATHER_BOTTOM: Box = {
  x: INNER_X,
  y: WEATHER_SPLIT_Y + BORDER,
  width: WEATHER_WIDTH,
  height: INNER_BOTTOM - WEATHER_SPLIT_Y - BORDER,
};

const TODAY: Box = {
  x: CALENDAR_X,
  y: BODY_Y,
  width: CALENDAR_WIDTH,
  height: CALENDAR_SPLIT_Y - BODY_Y,
};

const MONTH: Box = {
  x: CALENDAR_X,
  y: CALENDAR_SPLIT_Y + BORDER,
  width: CALENDAR_WIDTH,
  height: INNER_BOTTOM - CALENDAR_SPLIT_Y - BORDER,
};

const QUOTE: Box = {
  x: QUOTE_X,
  y: BODY_Y,
  width: QUOTE_WIDTH,
  height: INNER_BOTTOM - BODY_Y,
};

const TITLE = "FamilyScreen";
const TITLE_SCALE = 4;
const STAMP_SCALE = 3;

const LOCATION_SCALE = 3;
const TEMPERATURE_SCALE = 2;
const CONDITION_SCALE = 3;
const RANGE_SCALE = 2;
/** Reserved regardless of how the conditions wrap, so the range line never moves. */
const CONDITION_LINES = 2;

const HEADING_SCALE = 3;
const EVENT_SCALE = 2;
const DAY_SCALE = 2;
const QUOTE_SCALE = 3;

function drawHeader(bitmap: Bitmap, renderedAt: Date) {
  const y =
    HEADER.y + Math.floor((HEADER.height - lineHeight(TITLE_SCALE)) / 2);

  drawText(bitmap, TITLE, HEADER.x + PAD, y, TITLE_SCALE);

  // Not a clock: the device polls on a button press or every 30 minutes, so the
  // minute shown is the one this screen was drawn at.
  drawRight(
    bitmap,
    `Stand: ${formatTime(renderedAt)}`,
    HEADER.x + HEADER.width - PAD,
    y + lineHeight(TITLE_SCALE) - lineHeight(STAMP_SCALE),
    STAMP_SCALE,
  );
}

function drawWeatherCell(bitmap: Bitmap, weather: Weather, box: Box) {
  const area = inset(box);
  const right = area.x + area.width;

  drawText(bitmap, weather.location, area.x, area.y, LOCATION_SCALE);
  drawRight(
    bitmap,
    `${Math.round(weather.temperature)}°C`,
    right,
    area.y + lineHeight(LOCATION_SCALE) - lineHeight(TEMPERATURE_SCALE),
    TEMPERATURE_SCALE,
  );

  let y = area.y + lineHeight(LOCATION_SCALE) + BLOCK_GAP;

  wrapText(weather.description, area.width, CONDITION_SCALE)
    .slice(0, CONDITION_LINES)
    .forEach((line, index) => {
      drawText(
        bitmap,
        line,
        area.x,
        y + index * (lineHeight(CONDITION_SCALE) + LINE_GAP),
        CONDITION_SCALE,
      );
    });

  y +=
    CONDITION_LINES * lineHeight(CONDITION_SCALE) +
    (CONDITION_LINES - 1) * LINE_GAP +
    BLOCK_GAP;

  drawText(bitmap, `Hoch ${Math.round(weather.high)}°`, area.x, y, RANGE_SCALE);
  drawRight(bitmap, `Tief ${Math.round(weather.low)}°`, right, y, RANGE_SCALE);
}

function drawToday(
  bitmap: Bitmap,
  renderedAt: Date,
  events: string[],
  box: Box,
) {
  const area = inset(box);

  const heading = formatDayHeading(renderedAt);
  drawText(
    bitmap,
    heading,
    area.x,
    area.y,
    fitScale(heading, area.width, HEADING_SCALE),
  );

  let y = area.y + lineHeight(HEADING_SCALE) + BLOCK_GAP;

  for (const event of events.length > 0 ? events : ["Keine Termine"]) {
    if (y + lineHeight(EVENT_SCALE) > area.y + area.height) {
      break;
    }

    drawText(
      bitmap,
      event,
      area.x,
      y,
      fitScale(event, area.width, EVENT_SCALE),
    );
    y += lineHeight(EVENT_SCALE) + LINE_GAP;
  }
}

function drawMonth(bitmap: Bitmap, renderedAt: Date, box: Box) {
  const area = inset(box);
  const { weeks, today } = monthGrid(renderedAt);

  const columnWidth = Math.floor(area.width / WEEKDAY_LABELS.length);
  const rowHeight = Math.floor(area.height / (weeks.length + 1));
  const left =
    area.x + Math.floor((area.width - columnWidth * WEEKDAY_LABELS.length) / 2);

  const cell = (column: number, row: number) => ({
    x: left + column * columnWidth,
    y: area.y + row * rowHeight,
  });

  const centred = (text: string, column: number, row: number) => {
    const origin = cell(column, row);

    drawText(
      bitmap,
      text,
      origin.x + Math.floor((columnWidth - textWidth(text, DAY_SCALE)) / 2),
      origin.y + Math.floor((rowHeight - lineHeight(DAY_SCALE)) / 2),
      DAY_SCALE,
    );
  };

  WEEKDAY_LABELS.forEach((label, column) => centred(label, column, 0));

  weeks.forEach((week, row) => {
    week.forEach((day, column) => {
      if (day === null) {
        return;
      }

      centred(String(day), column, row + 1);

      if (day === today) {
        const origin = cell(column, row + 1);

        strokeRect(bitmap, origin.x, origin.y, columnWidth, rowHeight, 1);
      }
    });
  });
}

function drawDailyMessage(bitmap: Bitmap, message: string, box: Box) {
  drawTextBlock(bitmap, message, box, QUOTE_SCALE);
}

export type Homescreen = {
  /** When the device pulled this screen. */
  renderedAt: Date;
  /** Main residence, drawn in the upper cell. */
  primary: Weather;
  secondary: Weather;
  /** Today's appointments, one line each. */
  events: string[];
  /** Approved editorial content selected by the backend for this Vienna day. */
  dailyMessage: string;
};

export function renderHomescreen({
  renderedAt,
  primary,
  secondary,
  events,
  dailyMessage,
}: Homescreen) {
  const bitmap = createScreen();

  fillRect(bitmap, CALENDAR_X - BORDER, BODY_Y, BORDER, INNER_BOTTOM - BODY_Y);
  fillRect(bitmap, QUOTE_X - BORDER, BODY_Y, BORDER, INNER_BOTTOM - BODY_Y);
  fillRect(bitmap, INNER_X, WEATHER_SPLIT_Y, WEATHER_WIDTH, BORDER);
  fillRect(bitmap, CALENDAR_X, CALENDAR_SPLIT_Y, CALENDAR_WIDTH, BORDER);

  drawHeader(bitmap, renderedAt);
  drawWeatherCell(bitmap, primary, WEATHER_TOP);
  drawWeatherCell(bitmap, secondary, WEATHER_BOTTOM);
  drawToday(bitmap, renderedAt, events, TODAY);
  drawMonth(bitmap, renderedAt, MONTH);
  drawDailyMessage(bitmap, dailyMessage, QUOTE);

  return bitmap.bytes;
}
