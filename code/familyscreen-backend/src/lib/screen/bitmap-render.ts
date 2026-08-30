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
  ",": [0x00, 0x50, 0x30, 0x00, 0x00],
  ";": [0x00, 0x56, 0x36, 0x00, 0x00],
  "!": [0x00, 0x00, 0x5f, 0x00, 0x00],
  "?": [0x02, 0x01, 0x51, 0x09, 0x06],
  "(": [0x00, 0x1c, 0x22, 0x41, 0x00],
  ")": [0x00, 0x41, 0x22, 0x1c, 0x00],
  '"': [0x00, 0x07, 0x00, 0x07, 0x00],
  "+": [0x08, 0x08, 0x3e, 0x08, 0x08],
  "=": [0x14, 0x14, 0x14, 0x14, 0x14],
  "%": [0x23, 0x13, 0x08, 0x64, 0x62],
  "&": [0x36, 0x49, 0x55, 0x22, 0x50],
  _: [0x40, 0x40, 0x40, 0x40, 0x40],
};

export type Bitmap = {
  bytes: Uint8Array;
  setPixel: (x: number, y: number) => void;
};

/** Blank 1 bpp bitmap, MSB first, 1 is white and 0 is black. */
export function createBitmap(): Bitmap {
  const bytes = new Uint8Array(BYTES_PER_ROW * BITMAP_HEIGHT).fill(0xff);

  return {
    bytes,
    setPixel(x, y) {
      if (x < 0 || y < 0 || x >= BITMAP_WIDTH || y >= BITMAP_HEIGHT) {
        return;
      }

      bytes[y * BYTES_PER_ROW + (x >> 3)] &= ~(0x80 >> (x & 7));
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

/** The characters the font is actually asked for, after casing and diacritics. */
function normalize(text: string) {
  return [
    ...text
      .toUpperCase()
      .replace(/[ÄÖÜ]/g, (character) => UMLAUTS[character])
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, ""),
  ];
}

function toGlyphs(text: string) {
  return normalize(text).map((character) => GLYPHS[character] ?? null);
}

/**
 * The distinct characters this font cannot draw, so a composer can warn instead
 * of letting drawText swallow them. A space is blank on purpose, not missing.
 */
export function unsupportedCharacters(text: string) {
  return [
    ...new Set(
      normalize(text).filter(
        (character) => character !== " " && !GLYPHS[character],
      ),
    ),
  ];
}

// One blank column between glyphs, so a glyph slot is GLYPH_WIDTH + 1 wide.
export function textWidth(text: string, scale: number) {
  const count = toGlyphs(text).length;

  return count === 0 ? 0 : ((GLYPH_WIDTH + 1) * count - 1) * scale;
}

/**
 * A packed 1 bpp image, MSB first, a set bit is ink. Note this is the inverse
 * of the screen buffer, where the panel's convention makes 1 white: a tile is
 * drawn through setPixel, so only drawTile ever sees the difference.
 */
export type Tile = {
  width: number;
  height: number;
  bytes: Uint8Array;
};

export function tileStride(width: number) {
  return Math.ceil(width / 8);
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

/**
 * Largest scale up to maxScale whose wrapped block fits maxWidth by maxHeight.
 * Never returns 0, so a box too small for even one line still gets drawn.
 */
export function fitBlock(
  text: string,
  maxWidth: number,
  maxHeight: number,
  maxScale: number,
  lineGap: number,
) {
  for (let scale = maxScale; scale > 1; scale--) {
    const lines = wrapText(text, maxWidth, scale);
    const height =
      lines.length * GLYPH_HEIGHT * scale + (lines.length - 1) * lineGap;

    if (height <= maxHeight) {
      return scale;
    }
  }

  return 1;
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

/**
 * Draws a tile with its top left corner at (x, y). The tile has its own row
 * stride, which is not the screen's: a 260 wide tile packs into 33 bytes a row,
 * not 100. setPixel clips, so a tile hanging off the edge is simply cut.
 */
export function drawTile(bitmap: Bitmap, tile: Tile, x: number, y: number) {
  const stride = tileStride(tile.width);

  for (let row = 0; row < tile.height; row++) {
    for (let column = 0; column < tile.width; column++) {
      const byte = tile.bytes[row * stride + (column >> 3)];

      if (((byte >> (7 - (column & 7))) & 1) === 1) {
        bitmap.setPixel(x + column, y + row);
      }
    }
  }
}
