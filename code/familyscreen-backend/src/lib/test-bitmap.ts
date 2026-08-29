export const BITMAP_WIDTH = 800;
export const BITMAP_HEIGHT = 400;

const BYTES_PER_ROW = BITMAP_WIDTH / 8;

// Frame, smiley, and a solid block in the top-left corner. The block is the only
// asymmetric element: if it shows up anywhere but top-left, the ESP draws the
// buffer mirrored or rotated.
function isBlack(x: number, y: number) {
  if (x < 6 || y < 6 || x >= BITMAP_WIDTH - 6 || y >= BITMAP_HEIGHT - 6) {
    return true;
  }

  if (x >= 20 && x < 100 && y >= 20 && y < 100) {
    return true;
  }

  const dx = x - BITMAP_WIDTH / 2;
  const dy = y - BITMAP_HEIGHT / 2;
  const radius = Math.hypot(dx, dy);

  const face = Math.abs(radius - 150) < 5;
  const eyes = Math.hypot(Math.abs(dx) - 60, dy + 50) < 18;
  const mouth = dy > 30 && Math.abs(radius - 95) < 6;

  return face || eyes || mouth;
}

function render() {
  const buffer = Buffer.alloc(BYTES_PER_ROW * BITMAP_HEIGHT);

  for (let y = 0; y < BITMAP_HEIGHT; y++) {
    for (let x = 0; x < BITMAP_WIDTH; x++) {
      if (isBlack(x, y)) {
        buffer[y * BYTES_PER_ROW + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }
  }

  return buffer;
}

// 1 bit per pixel, MSB first, row-major, no padding: a set bit is black.
export const TEST_BITMAP = render();
