import { tileStride, type Tile } from "./bitmap-render";

/**
 * Browser only: this uses createImageBitmap and a canvas, so no server module
 * may import it. The composer runs it so the server never needs an image
 * decoder — what it receives is already 1 bpp.
 */
export async function fileToTile(
  file: File,
  maxWidth: number,
  maxHeight: number,
): Promise<Tile> {
  const source = await createImageBitmap(file);

  // Fit inside the cell, keeping the aspect ratio, and never enlarge: a 1 bpp
  // upscale only makes the dithering coarser.
  const factor = Math.min(
    maxWidth / source.width,
    maxHeight / source.height,
    1,
  );
  const width = Math.max(1, Math.floor(source.width * factor));
  const height = Math.max(1, Math.floor(source.height * factor));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    source.close();
    throw new Error("Canvas 2D is unavailable.");
  }

  context.drawImage(source, 0, 0, width, height);
  source.close();

  const { data } = context.getImageData(0, 0, width, height);

  // Luminance, carried as floats so the dither error has somewhere to go.
  const grey = new Float32Array(width * height);

  for (let index = 0; index < grey.length; index++) {
    const offset = index * 4;

    grey[index] =
      0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2];
  }

  const stride = tileStride(width);
  const bytes = new Uint8Array(stride * height);

  // Floyd-Steinberg. A plain threshold turns photographs into blobs at 1 bpp,
  // which is the difference between usable and not on an e-ink panel.
  const spread = (x: number, y: number, error: number, weight: number) => {
    if (x < 0 || x >= width || y >= height) {
      return;
    }

    grey[y * width + x] += (error * weight) / 16;
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      const old = grey[index];
      const white = old >= 128;

      if (!white) {
        bytes[y * stride + (x >> 3)] |= 0x80 >> (x & 7);
      }

      const error = old - (white ? 255 : 0);

      spread(x + 1, y, error, 7);
      spread(x - 1, y + 1, error, 3);
      spread(x, y + 1, error, 5);
      spread(x + 1, y + 1, error, 1);
    }
  }

  return { width, height, bytes };
}
