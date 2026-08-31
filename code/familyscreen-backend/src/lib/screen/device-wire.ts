import { createHash } from "node:crypto";

import { BITMAP_BYTES } from "./bitmap";

export function sha256Hex(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * The hash a cleared screen uploads, so a query can skip blank pages without
 * reading 44 kB per row. Derived rather than hardcoded: the screen already grew
 * from 400 to 440 rows. Lives here and not next to isBlankBitmap because that
 * module is bundled for the browser, which has no node:crypto.
 */
export const BLANK_SHA256 = sha256Hex(new Uint8Array(BITMAP_BYTES).fill(0xff));

export function strongEtag(value: string) {
  return `"${value}"`;
}

function etagValues(header: string | null) {
  return (header ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function etagMatches(header: string | null, etag: string) {
  return etagValues(header).some(
    (candidate) => candidate === "*" || candidate === etag,
  );
}

export async function readExactBody(request: Request, expectedBytes: number) {
  const declaredLength = request.headers.get("content-length");

  if (
    declaredLength !== null &&
    (!/^\d+$/.test(declaredLength) || Number(declaredLength) !== expectedBytes)
  ) {
    return null;
  }

  if (!request.body) {
    return null;
  }

  const result = new Uint8Array(expectedBytes);
  const reader = request.body.getReader();
  let offset = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      if (offset + value.byteLength > expectedBytes) {
        await reader.cancel();
        return null;
      }

      result.set(value, offset);
      offset += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }

  return offset === expectedBytes ? result : null;
}
