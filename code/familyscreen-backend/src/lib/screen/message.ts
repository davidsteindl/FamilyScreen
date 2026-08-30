import { BITMAP_HEIGHT, BITMAP_WIDTH } from "./bitmap";
import {
  createBitmap,
  drawText,
  drawTile,
  fillRect,
  fitBlock,
  fitScale,
  strokeRect,
  textWidth,
  wrapText,
  GLYPH_HEIGHT,
  type Bitmap,
  type Tile,
} from "./bitmap-render";
import { formatDayHeading } from "../content/calendar";

const MARGIN = 12;
const BORDER = 2;
const PAD = 12;
const LINE_GAP = 8;

type Box = { x: number; y: number; width: number; height: number };

const INNER_X = MARGIN + BORDER;
const INNER_Y = MARGIN + BORDER;
const INNER_RIGHT = BITMAP_WIDTH - MARGIN - BORDER;
const INNER_BOTTOM = BITMAP_HEIGHT - MARGIN - BORDER;

const HEADER: Box = {
  x: INNER_X,
  y: INNER_Y,
  width: INNER_RIGHT - INNER_X,
  height: 48,
};

const HEADER_RULE_Y = HEADER.y + HEADER.height;
const BODY_Y = HEADER_RULE_Y + BORDER;

const IMAGE_WIDTH = 284;
const TEXT_X = INNER_X + IMAGE_WIDTH + BORDER;

const IMAGE: Box = {
  x: INNER_X,
  y: BODY_Y,
  width: IMAGE_WIDTH,
  height: INNER_BOTTOM - BODY_Y,
};

/** Beside a picture. Without one the text takes the whole body instead. */
const TEXT_BESIDE: Box = {
  x: TEXT_X,
  y: BODY_Y,
  width: INNER_RIGHT - TEXT_X,
  height: INNER_BOTTOM - BODY_Y,
};

const TEXT_ALONE: Box = {
  x: INNER_X,
  y: BODY_Y,
  width: INNER_RIGHT - INNER_X,
  height: INNER_BOTTOM - BODY_Y,
};

/** What a tile may measure, which is what the composer scales its picture into. */
export const IMAGE_MAX_WIDTH = IMAGE.width - 2 * PAD;
export const IMAGE_MAX_HEIGHT = IMAGE.height - 2 * PAD;

const FROM_SCALE = 4;
const DATE_SCALE = 2;
const TEXT_SCALE = 5;

function lineHeight(scale: number) {
  return GLYPH_HEIGHT * scale;
}

function inset(box: Box): Box {
  return {
    x: box.x + PAD,
    y: box.y + PAD,
    width: box.width - 2 * PAD,
    height: box.height - 2 * PAD,
  };
}

function drawRight(
  bitmap: Bitmap,
  text: string,
  right: number,
  y: number,
  scale: number,
) {
  drawText(bitmap, text, right - textWidth(text, scale), y, scale);
}

function drawHeader(bitmap: Bitmap, from: string, sentAt: Date) {
  const area = inset(HEADER);
  const right = area.x + area.width;

  const label = `VON ${from}`;
  // The date has the fixed half of the header, the name takes what is left.
  const day = formatDayHeading(sentAt);
  const dateWidth = textWidth(day, DATE_SCALE);
  const y = HEADER.y + Math.floor((HEADER.height - lineHeight(FROM_SCALE)) / 2);

  drawText(
    bitmap,
    label,
    area.x,
    y,
    fitScale(label, area.width - dateWidth - PAD, FROM_SCALE),
  );

  drawRight(
    bitmap,
    day,
    right,
    y + lineHeight(FROM_SCALE) - lineHeight(DATE_SCALE),
    DATE_SCALE,
  );
}

/** Centred both ways in its cell, at its own size — a tile is never scaled. */
function drawImage(bitmap: Bitmap, tile: Tile) {
  const area = inset(IMAGE);

  drawTile(
    bitmap,
    tile,
    area.x + Math.floor((area.width - tile.width) / 2),
    area.y + Math.floor((area.height - tile.height) / 2),
  );
}

function drawBody(bitmap: Bitmap, text: string, box: Box) {
  const area = inset(box);

  // The longest word picks the ceiling, so no line can run past the column.
  const widest = Math.min(
    ...text
      .split(" ")
      .filter(Boolean)
      .map((word) => fitScale(word, area.width, TEXT_SCALE)),
    TEXT_SCALE,
  );

  const scale = fitBlock(text, area.width, area.height, widest, LINE_GAP);
  const lines = wrapText(text, area.width, scale);
  const height =
    lines.length * lineHeight(scale) + (lines.length - 1) * LINE_GAP;
  const top = area.y + Math.floor((area.height - height) / 2);

  lines.forEach((line, index) => {
    drawText(
      bitmap,
      line,
      area.x,
      top + index * (lineHeight(scale) + LINE_GAP),
      scale,
    );
  });
}

export type Message = {
  /** Sender name for the header. */
  from: string;
  sentAt: Date;
  text: string;
  /** Without one the text runs across the full width. */
  image?: Tile;
};

export function renderMessage({ from, sentAt, text, image }: Message) {
  const bitmap = createBitmap();

  strokeRect(
    bitmap,
    MARGIN,
    MARGIN,
    BITMAP_WIDTH - 2 * MARGIN,
    BITMAP_HEIGHT - 2 * MARGIN,
    BORDER,
  );

  fillRect(bitmap, INNER_X, HEADER_RULE_Y, HEADER.width, BORDER);

  drawHeader(bitmap, from, sentAt);

  if (image) {
    fillRect(bitmap, TEXT_X - BORDER, BODY_Y, BORDER, INNER_BOTTOM - BODY_Y);
    drawImage(bitmap, image);
  }

  drawBody(bitmap, text, image ? TEXT_BESIDE : TEXT_ALONE);

  return bitmap.bytes;
}
