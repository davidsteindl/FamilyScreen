// Run with: npx tsx src/lib/screen/message.check.ts
import assert from "node:assert/strict";

import { BITMAP_HEIGHT, BITMAP_WIDTH, BYTES_PER_ROW } from "./bitmap";
import {
  createBitmap,
  drawText,
  drawTile,
  fitBlock,
  textWidth,
  unsupportedCharacters,
  type Tile,
} from "./bitmap-render";
import { IMAGE_MAX_HEIGHT, IMAGE_MAX_WIDTH, renderMessage } from "./message";

const black = (bytes: Uint8Array, x: number, y: number) =>
  ((bytes[y * BYTES_PER_ROW + (x >> 3)] >> (7 - (x & 7))) & 1) === 0;

// Mirrors the layout constants in message.ts. The point is to notice when they
// move, so the check states them itself instead of importing them.
const MARGIN = 12;
const IMAGE_TO = 298;
const TEXT_FROM = 300;
const BODY_TOP = 64;

// The cell the composer scales pictures into and the server validates against.
// Both sides key off these two numbers, so they are part of the wire contract.
assert.equal(IMAGE_MAX_WIDTH, 260);
assert.equal(IMAGE_MAX_HEIGHT, 338);

//
// NEW GLYPHS
//

// Every character added for messages has to actually draw something.
for (const character of ',;!?()"+=%&_') {
  const sheet = createBitmap();
  drawText(sheet, character, 10, 10, 2);

  assert.ok(
    sheet.bytes.some((byte) => byte !== 0xff),
    `glyph draws nothing: ${character}`,
  );
}

// A comma is narrower than a W but occupies the same slot, so widths are equal.
assert.equal(textWidth(",", 3), textWidth("W", 3));

assert.deepEqual(unsupportedCharacters("HALLO #"), ["#"]);
assert.deepEqual(unsupportedCharacters("HALLO OMA, WIE GEHT ES DIR?"), []);
// Lower case and umlauts are folded before the lookup, not reported as missing.
assert.deepEqual(unsupportedCharacters("Grüße!"), []);
// Each missing character is named once, however often it appears.
assert.deepEqual(unsupportedCharacters("#a# ~"), ["#", "~"]);

//
// TILES
//

const tile3: Tile = {
  width: 3,
  height: 3,
  // 101 / 010 / 101, one byte a row.
  bytes: new Uint8Array([0b10100000, 0b01000000, 0b10100000]),
};

const placed = createBitmap();
drawTile(placed, tile3, 20, 30);

assert.equal(black(placed.bytes, 20, 30), true);
assert.equal(black(placed.bytes, 21, 30), false);
assert.equal(black(placed.bytes, 22, 30), true);
assert.equal(black(placed.bytes, 21, 31), true);
assert.equal(black(placed.bytes, 20, 31), false);
assert.equal(black(placed.bytes, 23, 30), false); // nothing past the tile

// A tile hanging off the edge is cut, not wrapped onto the next row.
const clipped = createBitmap();
drawTile(clipped, tile3, BITMAP_WIDTH - 1, BITMAP_HEIGHT - 1);

assert.equal(black(clipped.bytes, BITMAP_WIDTH - 1, BITMAP_HEIGHT - 1), true);
assert.equal(black(clipped.bytes, 0, BITMAP_HEIGHT - 1), false);
assert.equal(
  clipped.bytes
    .subarray(0, (BITMAP_HEIGHT - 1) * BYTES_PER_ROW)
    .every((b) => b === 0xff),
  true,
);

// The stride trap: 12 wide packs into 2 bytes a row, not into BYTES_PER_ROW.
// Row 0 is all ink, row 1 is ink only in the last column.
const wide: Tile = {
  width: 12,
  height: 2,
  bytes: new Uint8Array([0xff, 0xf0, 0x00, 0x10]),
};

const strided = createBitmap();
drawTile(strided, wide, 0, 0);

for (let x = 0; x < 12; x++) {
  assert.equal(black(strided.bytes, x, 0), true, `row 0 column ${x}`);
  assert.equal(black(strided.bytes, x, 1), x === 11, `row 1 column ${x}`);
}

assert.equal(black(strided.bytes, 12, 0), false); // padding bits are not drawn

//
// BLOCK FITTING
//

const SHORT = "HALLO";
const LONG =
  "HALLO OMA UND OPA WIR KOMMEN AM SAMSTAG ZU BESUCH UND BRINGEN KUCHEN MIT DIE KINDER FREUEN SICH SCHON SEHR AUF EUCH UND WOLLEN UNBEDINGT WIEDER IM GARTEN SPIELEN BITTE SAGT BESCHEID OB EUCH DER NACHMITTAG PASST SONST KOMMEN WIR AM SONNTAG VORBEI BIS BALD EUER DAVID";

assert.ok(
  fitBlock(LONG, 462, 338, 5, 8) < fitBlock(SHORT, 462, 338, 5, 8),
  "a long text has to be drawn smaller than a short one",
);
assert.equal(fitBlock(SHORT, 462, 338, 5, 8), 5); // room to spare keeps maxScale
assert.equal(fitBlock(LONG, 20, 20, 5, 8), 1); // never 0, however tight the box

//
// MESSAGE
//

const sentAt = new Date("2026-08-30T10:00:00Z");
const base = renderMessage({ from: "DAVID", sentAt, text: "HALLO OMA" });

assert.equal(base.length, BYTES_PER_ROW * BITMAP_HEIGHT);

// Same input, same bytes: the preview and the stored copy depend on it.
assert.deepEqual(
  renderMessage({ from: "DAVID", sentAt, text: "HALLO OMA" }),
  base,
);

// A different day must change the header, or something reads the wall clock.
assert.notDeepEqual(
  renderMessage({
    from: "DAVID",
    sentAt: new Date("2026-08-31T10:00:00Z"),
    text: "HALLO OMA",
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

assertInsideFrame(base, "short message");

// The frame itself is drawn, just inside the margin on every side.
assert.equal(black(base, MARGIN, MARGIN), true);
assert.equal(
  black(base, BITMAP_WIDTH - MARGIN - 1, BITMAP_HEIGHT - MARGIN - 1),
  true,
);

// Without a picture there is no divider: the body owns the full width instead.
assert.equal(
  inkIn(base, IMAGE_TO, BODY_TOP, TEXT_FROM, BITMAP_HEIGHT - MARGIN - 2),
  0,
  "the divider may not be drawn when there is no picture",
);
// ...and the text really does claim the space the picture would have taken.
assert.ok(
  inkIn(base, MARGIN + 2, BODY_TOP, IMAGE_TO, BITMAP_HEIGHT - MARGIN - 2) > 0,
  "without a picture the text has to run across the full width",
);

// A picture that fills the whole cell, so containment is tested at the limit.
const full: Tile = {
  width: IMAGE_MAX_WIDTH,
  height: IMAGE_MAX_HEIGHT,
  bytes: new Uint8Array(
    Math.ceil(IMAGE_MAX_WIDTH / 8) * IMAGE_MAX_HEIGHT,
  ).fill(0xff),
};

const half: Tile = {
  width: 100,
  height: 80,
  bytes: new Uint8Array(Math.ceil(100 / 8) * 80).fill(0xff),
};

const withImage = renderMessage({
  from: "DAVID",
  sentAt,
  text: "HALLO OMA",
  image: full,
});

assertInsideFrame(withImage, "full size picture");
assert.ok(
  inkIn(withImage, MARGIN + 2, BODY_TOP, IMAGE_TO, BITMAP_HEIGHT - MARGIN - 2) >
    0,
  "expected the picture to be drawn",
);

// The divider sits at exactly x=298..299, with padding either side of it. This
// pins the split in absolute terms; the containment checks below only compare
// two renders against each other and would not notice the column moving.
for (const y of [BODY_TOP + 10, BITMAP_HEIGHT - MARGIN - 10]) {
  assert.equal(black(withImage, IMAGE_TO - 1, y), false, `left of the divider at ${y}`);
  assert.equal(black(withImage, IMAGE_TO, y), true, `divider at ${y}`);
  assert.equal(black(withImage, TEXT_FROM - 1, y), true, `divider at ${y}`);
  assert.equal(black(withImage, TEXT_FROM, y), false, `right of the divider at ${y}`);
}

// Containment, the valuable one: a much longer text may not touch the picture.
const wordy = renderMessage({
  from: "DAVID",
  sentAt,
  text: LONG,
  image: full,
});

assertInsideFrame(wordy, "long text beside a picture");
sameRegion(
  withImage,
  wordy,
  { x0: 0, x1: IMAGE_TO, y0: 0, y1: BITMAP_HEIGHT },
  "the text bled into the picture column",
);
assert.ok(
  inkIn(wordy, TEXT_FROM, BODY_TOP, BITMAP_WIDTH - MARGIN, BITMAP_HEIGHT - MARGIN) >
    inkIn(
      withImage,
      TEXT_FROM,
      BODY_TOP,
      BITMAP_WIDTH - MARGIN,
      BITMAP_HEIGHT - MARGIN,
    ),
  "expected the longer text to put more ink in the text column",
);

// ...and the other way round: a different picture may not move the text.
const smaller = renderMessage({
  from: "DAVID",
  sentAt,
  text: "HALLO OMA",
  image: half,
});

assertInsideFrame(smaller, "small picture");
sameRegion(
  withImage,
  smaller,
  { x0: TEXT_FROM, x1: BITMAP_WIDTH, y0: 0, y1: BITMAP_HEIGHT },
  "the picture bled into the text column",
);

// A long sender name may not run into the date, and neither may leave the header.
const shouty = renderMessage({
  from: "MAXIMILIAN VON HABSBURG LOTHRINGEN",
  sentAt,
  text: "HALLO OMA",
});

assertInsideFrame(shouty, "long sender name");
sameRegion(
  base,
  shouty,
  { x0: 0, x1: BITMAP_WIDTH, y0: BODY_TOP, y1: BITMAP_HEIGHT },
  "the header bled into the body",
);

console.log("message check ok");
