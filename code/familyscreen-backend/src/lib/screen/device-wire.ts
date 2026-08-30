import { createHash } from "node:crypto";

export function sha256Hex(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

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
