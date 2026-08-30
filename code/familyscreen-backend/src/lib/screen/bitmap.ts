export const BITMAP_WIDTH = 800;
/** The device owns the 40 px page header; the API only transports this area. */
export const BITMAP_HEIGHT = 440;

export const BYTES_PER_ROW = BITMAP_WIDTH / 8;
export const BITMAP_BYTES = BYTES_PER_ROW * BITMAP_HEIGHT;

/** Works in both runtimes, unlike Buffer — the canvas preview imports this module too. */
export function toBase64(bytes: Uint8Array) {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

export function unpackBitmap(packed: Uint8Array) {
  const rgba = new Uint8ClampedArray(BITMAP_WIDTH * BITMAP_HEIGHT * 4);

  for (let index = 0; index < BITMAP_WIDTH * BITMAP_HEIGHT; index++) {
    // This is the e-paper controller's native convention: 1 = white, 0 = ink.
    const black = ((packed[index >> 3] >> (7 - (index & 7))) & 1) === 0;
    const value = black ? 0 : 255;
    const offset = index * 4;

    rgba[offset] = value;
    rgba[offset + 1] = value;
    rgba[offset + 2] = value;
    rgba[offset + 3] = 255;
  }

  return rgba;
}
