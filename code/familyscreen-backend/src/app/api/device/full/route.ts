import requireDevice from "@/lib/auth/require-device";
import { BITMAP_HEIGHT, BITMAP_WIDTH, toBase64 } from "@/lib/bitmap";
import { getPages } from "@/lib/pages";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const device = await requireDevice(req);

  if (!device) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const pages = await Promise.all(
    (await getPages(device.userId, device.userName)).map(async (page) => ({
      ...page.meta,
      // A page that cannot render is sent without one instead of failing the
      // whole payload; the device keeps showing its last image for that page.
      bitmap: await page.render().then(toBase64, () => undefined),
    })),
  );

  return Response.json(
    {
      pageCount: pages.length,
      bitmapWidth: BITMAP_WIDTH,
      bitmapHeight: BITMAP_HEIGHT,
      pages,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
