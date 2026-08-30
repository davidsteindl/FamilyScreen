import requireDevice from "@/lib/auth/require-device";
import { BITMAP_HEIGHT, BITMAP_WIDTH, toBase64 } from "@/lib/screen/bitmap";
import {
  createManifestRevision,
  getRenderedDevicePages,
} from "@/lib/screen/device-protocol";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const device = await requireDevice(req);

  if (!device) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const renderedPages = await getRenderedDevicePages(
    device.userId,
    device.userName,
  );
  const pages = renderedPages.map(({ bitmap, ...page }) => ({
    ...page,
    bitmap: toBase64(bitmap),
  }));

  return Response.json(
    {
      manifestRevision: createManifestRevision(renderedPages),
      pageCount: pages.length,
      bitmapWidth: BITMAP_WIDTH,
      bitmapHeight: BITMAP_HEIGHT,
      pages,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
