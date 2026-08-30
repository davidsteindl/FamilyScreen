import assert from "node:assert/strict";

import { BITMAP_BYTES, BITMAP_HEIGHT, BITMAP_WIDTH } from "./bitmap";
import { createBitmap } from "./bitmap-render";
import {
  etagMatches,
  readExactBody,
  sha256Hex,
  strongEtag,
} from "./device-wire";
import { renderMockMessage } from "./message-screen";

assert.equal(BITMAP_WIDTH, 800);
assert.equal(BITMAP_HEIGHT, 440);
assert.equal(BITMAP_BYTES, 44_000);

const blank = createBitmap();
assert.equal(blank.bytes.byteLength, BITMAP_BYTES);
assert.ok(blank.bytes.every((byte) => byte === 0xff));
blank.setPixel(0, 0);
assert.equal(blank.bytes[0], 0x7f);

const mock = renderMockMessage("Tobias", "Ottola");
assert.equal(mock.byteLength, BITMAP_BYTES);
assert.ok(mock.some((byte) => byte !== 0xff));

assert.equal(
  sha256Hex(new Uint8Array([0, 1, 2])),
  "ae4b3280e56e2faf83f414a6e3dabe9d5fbe18976544c05fed121accb85b53fc",
);
assert.equal(strongEtag("abc"), '"abc"');
assert.equal(etagMatches('"old", "abc"', '"abc"'), true);
assert.equal(etagMatches("*", '"abc"'), true);
assert.equal(etagMatches('W/"abc"', '"abc"'), false);

async function checkRequestBodies() {
  const exact = await readExactBody(
    new Request("https://example.test", {
      method: "PUT",
      body: new Uint8Array([1, 2, 3]),
    }),
    3,
  );
  assert.deepEqual(exact, new Uint8Array([1, 2, 3]));

  assert.equal(
    await readExactBody(
      new Request("https://example.test", {
        method: "PUT",
        body: new Uint8Array([1, 2, 3, 4]),
      }),
      3,
    ),
    null,
  );
}

checkRequestBodies().then(() => console.log("device wire check ok"));
