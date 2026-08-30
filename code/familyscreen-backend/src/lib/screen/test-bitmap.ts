import { BITMAP_HEIGHT, BITMAP_WIDTH } from "./bitmap";
import {
  createBitmap,
  drawText,
  fitScale,
  textWidth,
  GLYPH_HEIGHT,
} from "./bitmap-render";

const MARGIN = 80;

export function renderTestBitmap(name: string) {
  const bitmap = createBitmap();

  for (let y = 0; y < BITMAP_HEIGHT; y++) {
    for (let x = 0; x < BITMAP_WIDTH; x++) {
      const frame =
        x < 6 || y < 6 || x >= BITMAP_WIDTH - 6 || y >= BITMAP_HEIGHT - 6;
      const block = x >= 20 && x < 100 && y >= 20 && y < 100;

      if (frame || block) {
        bitmap.setPixel(x, y);
      }
    }
  }

  if (textWidth(name, 1) === 0) {
    return bitmap.bytes;
  }

  const scale = fitScale(
    name,
    BITMAP_WIDTH - 2 * MARGIN,
    Math.floor((BITMAP_HEIGHT - 2 * MARGIN) / GLYPH_HEIGHT),
  );

  drawText(
    bitmap,
    name,
    Math.floor((BITMAP_WIDTH - textWidth(name, scale)) / 2),
    Math.floor((BITMAP_HEIGHT - GLYPH_HEIGHT * scale) / 2),
    scale,
  );

  return bitmap.bytes;
}
