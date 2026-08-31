import { timingSafeEqual } from "node:crypto";

import requireDevice from "@/lib/auth/require-device";
import { storeDeviceBroadcast } from "@/lib/messaging/messages";
import { notifyDrawingArrived } from "@/lib/messaging/notify";
import { BITMAP_BYTES, isBlankBitmap } from "@/lib/screen/bitmap";
import {
  etagMatches,
  getRenderedDevicePage,
  readExactBody,
  sha256Hex,
  strongEtag,
} from "@/lib/screen/device-protocol";

export const runtime = "nodejs";

const DRAWING_PAGE_ID = "ottola";
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

function privateHeaders(etag?: string) {
  return {
    ...(etag ? { ETag: etag } : {}),
    "Cache-Control": "private, no-cache, must-revalidate",
    Vary: "Authorization",
  };
}

export async function GET(
  request: Request,
  context: RouteContext<"/api/device/pages/[pageId]/bitmap">,
) {
  const device = await requireDevice(request);

  if (!device) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { pageId } = await context.params;
  const page = await getRenderedDevicePage(
    device.userId,
    device.userName,
    pageId,
  );

  if (!page) {
    return Response.json({ error: "Page not found" }, { status: 404 });
  }

  const etag = strongEtag(page.sha256);
  const headers = {
    ...privateHeaders(etag),
    "Content-Type": "application/octet-stream",
    "Content-Length": String(BITMAP_BYTES),
    "X-Content-SHA256": page.sha256,
  };

  if (etagMatches(request.headers.get("if-none-match"), etag)) {
    return new Response(null, { status: 304, headers });
  }

  const ifMatch = request.headers.get("if-match");

  if (ifMatch && !etagMatches(ifMatch, etag)) {
    return Response.json(
      { error: "Page changed; fetch the manifest again" },
      { status: 412, headers: privateHeaders(etag) },
    );
  }

  return new Response(Buffer.from(page.bitmap), { status: 200, headers });
}

export async function PUT(
  request: Request,
  context: RouteContext<"/api/device/pages/[pageId]/bitmap">,
) {
  const device = await requireDevice(request);

  if (!device) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { pageId } = await context.params;

  if (pageId !== DRAWING_PAGE_ID) {
    return Response.json(
      { error: "Only the device drawing page accepts uploads" },
      { status: 405, headers: { Allow: "GET" } },
    );
  }

  const contentType = request.headers.get("content-type") ?? "";

  if (!contentType.toLowerCase().startsWith("application/octet-stream")) {
    return Response.json(
      { error: "Content-Type must be application/octet-stream" },
      { status: 415 },
    );
  }

  const suppliedHash = request.headers.get("x-content-sha256") ?? "";
  const idempotencyKey = request.headers.get("idempotency-key") ?? "";

  if (
    !SHA256_PATTERN.test(suppliedHash) ||
    idempotencyKey !== suppliedHash
  ) {
    return Response.json(
      { error: "A matching SHA-256 hash and idempotency key are required" },
      { status: 400 },
    );
  }

  const bitmap = await readExactBody(request, BITMAP_BYTES);

  if (!bitmap) {
    return Response.json(
      { error: `Bitmap must contain exactly ${BITMAP_BYTES} bytes` },
      { status: 400 },
    );
  }

  const actualHash = sha256Hex(bitmap);
  const hashMatches = timingSafeEqual(
    Buffer.from(actualHash, "hex"),
    Buffer.from(suppliedHash, "hex"),
  );

  if (!hashMatches) {
    return Response.json(
      { error: "X-Content-SHA256 does not match the request body" },
      { status: 422 },
    );
  }

  const result = await storeDeviceBroadcast({
    deviceId: device.id,
    senderUserId: device.userId,
    bitmapData: bitmap,
    contentSha256: actualHash,
    idempotencyKey,
  });

  if (result.recipientCount === 0) {
    return Response.json(
      { error: "The screen owner has no configured contacts" },
      { status: 409 },
    );
  }

  const duplicate = result.insertedCount === 0;

  // Only a genuinely new state worth looking at: a retry inserts nothing, and a
  // cleared screen is not news anyone wants in their inbox.
  if (!duplicate && !isBlankBitmap(bitmap)) {
    await notifyDrawingArrived({
      deviceId: device.id,
      senderUserId: device.userId,
      senderName: device.userName,
      contentSha256: actualHash,
      // The host the screen just uploaded to, so the link needs no configuring.
      inboxUrl: new URL("/inbox", request.url).toString(),
    });
  }

  return Response.json(
    {
      ok: true,
      duplicate,
      deliveredTo: result.recipientCount,
      sha256: actualHash,
    },
    {
      status: duplicate ? 200 : 201,
      headers: privateHeaders(strongEtag(actualHash)),
    },
  );
}
