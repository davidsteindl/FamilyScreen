import { BITMAP_HEIGHT, BITMAP_WIDTH } from "./bitmap";
import {
  createBitmap,
  drawText,
  fillRect,
  fitBlock,
  fitScale,
  strokeRect,
  textWidth,
  wrapText,
  GLYPH_HEIGHT,
  type Bitmap,
} from "./bitmap-render";

/** Geometry every full-screen page shares, so the frame lines up across pages. */
export const MARGIN = 12;
export const BORDER = 2;
export const PAD = 12;
export const LINE_GAP = 8;

export type Box = { x: number; y: number; width: number; height: number };

export const INNER_X = MARGIN + BORDER;
export const INNER_Y = MARGIN + BORDER;
export const INNER_RIGHT = BITMAP_WIDTH - MARGIN - BORDER;
export const INNER_BOTTOM = BITMAP_HEIGHT - MARGIN - BORDER;

export const HEADER: Box = {
  x: INNER_X,
  y: INNER_Y,
  width: INNER_RIGHT - INNER_X,
  height: 48,
};

export const HEADER_RULE_Y = HEADER.y + HEADER.height;
export const BODY_Y = HEADER_RULE_Y + BORDER;

export function lineHeight(scale: number) {
  return GLYPH_HEIGHT * scale;
}

export function inset(box: Box): Box {
  return {
    x: box.x + PAD,
    y: box.y + PAD,
    width: box.width - 2 * PAD,
    height: box.height - 2 * PAD,
  };
}

export function drawRight(
  bitmap: Bitmap,
  text: string,
  right: number,
  y: number,
  scale: number,
) {
  drawText(bitmap, text, right - textWidth(text, scale), y, scale);
}

/** A blank page with the outer frame and the rule under the header already on it. */
export function createScreen() {
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

  return bitmap;
}

/**
 * Wrapped text, centred in its box, shrunk until the whole block fits. The
 * longest word picks the ceiling first, so no line can run past the column.
 */
export function drawTextBlock(
  bitmap: Bitmap,
  text: string,
  box: Box,
  maxScale: number,
) {
  const area = inset(box);

  const widest = Math.min(
    ...text.split(" ").map((word) => fitScale(word, area.width, maxScale)),
    maxScale,
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
