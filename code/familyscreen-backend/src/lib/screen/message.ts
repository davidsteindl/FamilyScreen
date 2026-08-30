import { formatDayHeading } from "../content/calendar";
import {
  drawText,
  drawTile,
  fillRect,
  fitScale,
  textWidth,
  type Bitmap,
  type Tile,
} from "./bitmap-render";
import {
  createScreen,
  drawRight,
  drawTextBlock,
  inset,
  lineHeight,
  BODY_Y,
  BORDER,
  HEADER,
  INNER_BOTTOM,
  INNER_RIGHT,
  INNER_X,
  PAD,
  type Box,
} from "./layout";

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

export type Message = {
  /** Sender name for the header. */
  from: string;
  sentAt: Date;
  text: string;
  /** Without one the text runs across the full width. */
  image?: Tile;
};

export function renderMessage({ from, sentAt, text, image }: Message) {
  const bitmap = createScreen();

  drawHeader(bitmap, from, sentAt);

  if (image) {
    fillRect(bitmap, TEXT_X - BORDER, BODY_Y, BORDER, INNER_BOTTOM - BODY_Y);
    drawImage(bitmap, image);
  }

  drawTextBlock(bitmap, text, image ? TEXT_BESIDE : TEXT_ALONE, TEXT_SCALE);

  return bitmap.bytes;
}
