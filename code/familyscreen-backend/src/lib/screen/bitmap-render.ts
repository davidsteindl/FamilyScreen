import { BITMAP_HEIGHT, BITMAP_WIDTH, BYTES_PER_ROW } from "./bitmap";

export const GLYPH_WIDTH = 5;
export const GLYPH_HEIGHT = 7;

// 5x7 glyphs, one byte per column, bit 0 is the top row.
const GLYPHS: Record<string, number[]> = {
  A: [0x7e, 0x11, 0x11, 0x11, 0x7e],
  B: [0x7f, 0x49, 0x49, 0x49, 0x36],
  C: [0x3e, 0x41, 0x41, 0x41, 0x22],
  D: [0x7f, 0x41, 0x41, 0x22, 0x1c],
  E: [0x7f, 0x49, 0x49, 0x49, 0x41],
  F: [0x7f, 0x09, 0x09, 0x09, 0x01],
  G: [0x3e, 0x41, 0x49, 0x49, 0x7a],
  H: [0x7f, 0x08, 0x08, 0x08, 0x7f],
  I: [0x00, 0x41, 0x7f, 0x41, 0x00],
  J: [0x20, 0x40, 0x41, 0x3f, 0x01],
  K: [0x7f, 0x08, 0x14, 0x22, 0x41],
  L: [0x7f, 0x40, 0x40, 0x40, 0x40],
  M: [0x7f, 0x02, 0x0c, 0x02, 0x7f],
  N: [0x7f, 0x04, 0x08, 0x10, 0x7f],
  O: [0x3e, 0x41, 0x41, 0x41, 0x3e],
  P: [0x7f, 0x09, 0x09, 0x09, 0x06],
  Q: [0x3e, 0x41, 0x51, 0x21, 0x5e],
  R: [0x7f, 0x09, 0x19, 0x29, 0x46],
  S: [0x46, 0x49, 0x49, 0x49, 0x31],
  T: [0x01, 0x01, 0x7f, 0x01, 0x01],
  U: [0x3f, 0x40, 0x40, 0x40, 0x3f],
  V: [0x1f, 0x20, 0x40, 0x20, 0x1f],
  W: [0x3f, 0x40, 0x38, 0x40, 0x3f],
  X: [0x63, 0x14, 0x08, 0x14, 0x63],
  Y: [0x07, 0x08, 0x70, 0x08, 0x07],
  Z: [0x61, 0x51, 0x49, 0x45, 0x43],
  "0": [0x3e, 0x51, 0x49, 0x45, 0x3e],
  "1": [0x00, 0x42, 0x7f, 0x40, 0x00],
  "2": [0x62, 0x51, 0x49, 0x49, 0x46],
  "3": [0x22, 0x41, 0x49, 0x49, 0x36],
  "4": [0x18, 0x14, 0x12, 0x7f, 0x10],
  "5": [0x27, 0x45, 0x45, 0x45, 0x39],
  "6": [0x3c, 0x4a, 0x49, 0x49, 0x30],
  "7": [0x01, 0x71, 0x09, 0x05, 0x03],
  "8": [0x36, 0x49, 0x49, 0x49, 0x36],
  "9": [0x06, 0x49, 0x49, 0x29, 0x1e],
  "°": [0x02, 0x05, 0x02, 0x00, 0x00],
  "-": [0x00, 0x08, 0x08, 0x08, 0x00],
  ".": [0x00, 0x00, 0x40, 0x00, 0x00],
  ":": [0x00, 0x00, 0x14, 0x00, 0x00],
  "/": [0x40, 0x20, 0x10, 0x08, 0x04],
};

export type Bitmap = {
  bytes: Uint8Array;
  setPixel: (x: number, y: number) => void;
};

/** Blank 1 bpp bitmap, MSB first, a set bit is black. */
export function createBitmap(): Bitmap {
  const bytes = new Uint8Array(BYTES_PER_ROW * BITMAP_HEIGHT);

  return {
    bytes,
    setPixel(x, y) {
      if (x < 0 || y < 0 || x >= BITMAP_WIDTH || y >= BITMAP_HEIGHT) {
        return;
      }

      bytes[y * BYTES_PER_ROW + (x >> 3)] |= 0x80 >> (x & 7);
    },
  };
}

export function fillRect(
  bitmap: Bitmap,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      bitmap.setPixel(x + column, y + row);
    }
  }
}

export function strokeRect(
  bitmap: Bitmap,
  x: number,
  y: number,
  width: number,
  height: number,
  thickness: number,
) {
  fillRect(bitmap, x, y, width, thickness);
  fillRect(bitmap, x, y + height - thickness, width, thickness);
  fillRect(bitmap, x, y, thickness, height);
  fillRect(bitmap, x + width - thickness, y, thickness, height);
}

// The font has no umlauts, so they are spelled out. Sharp s is handled by toUpperCase.
const UMLAUTS: Record<string, string> = {
  Ä: "AE",
  Ö: "OE",
  Ü: "UE",
};

function toGlyphs(text: string) {
  return [
    ...text
      .toUpperCase()
      .replace(/[ÄÖÜ]/g, (character) => UMLAUTS[character])
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, ""),
  ].map((character) => GLYPHS[character] ?? null);
}

// One blank column between glyphs, so a glyph slot is GLYPH_WIDTH + 1 wide.
export function textWidth(text: string, scale: number) {
  const count = toGlyphs(text).length;

  return count === 0 ? 0 : ((GLYPH_WIDTH + 1) * count - 1) * scale;
}

/** Largest scale up to maxScale that keeps the text inside maxWidth. */
export function fitScale(text: string, maxWidth: number, maxScale: number) {
  const count = toGlyphs(text).length;

  if (count === 0) {
    return Math.max(1, maxScale);
  }

  return Math.max(
    1,
    Math.min(maxScale, Math.floor(maxWidth / ((GLYPH_WIDTH + 1) * count))),
  );
}

/** Greedy word wrap. A word wider than maxWidth stays on its own line. */
export function wrapText(text: string, maxWidth: number, scale: number) {
  const lines: string[] = [];

  for (const word of text.split(" ").filter(Boolean)) {
    const last = lines.length - 1;

    if (last >= 0 && textWidth(`${lines[last]} ${word}`, scale) <= maxWidth) {
      lines[last] = `${lines[last]} ${word}`;
    } else {
      lines.push(word);
    }
  }

  return lines;
}

/** Draws text with its top left corner at (x, y). Unknown characters stay blank. */
export function drawText(
  bitmap: Bitmap,
  text: string,
  x: number,
  y: number,
  scale: number,
) {
  toGlyphs(text).forEach((glyph, index) => {
    if (!glyph) {
      return;
    }

    for (let column = 0; column < GLYPH_WIDTH; column++) {
      for (let row = 0; row < GLYPH_HEIGHT; row++) {
        if (((glyph[column] >> row) & 1) === 0) {
          continue;
        }

        const left = x + ((GLYPH_WIDTH + 1) * index + column) * scale;
        const top = y + row * scale;

        for (let dy = 0; dy < scale; dy++) {
          for (let dx = 0; dx < scale; dx++) {
            bitmap.setPixel(left + dx, top + dy);
          }
        }
      }
    }
  });
}
