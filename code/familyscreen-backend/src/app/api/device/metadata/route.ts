import requireDevice from "@/lib/auth/require-device";
import { getContacts } from "@/lib/contacts";
import { TEST_BITMAP, BITMAP_WIDTH, BITMAP_HEIGHT } from "@/lib/test-bitmap";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const device = await requireDevice(req);

  if (!device) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const others = await getContacts(device.userId);

  const pages = [
    { type: "home" as const, name: device.userName },
    ...others.map((user) => ({ type: "user" as const, ...user })),
  ];

  return Response.json(
    {
      pageCount: pages.length,
      bitmapWidth: BITMAP_WIDTH,
      bitmapHeight: BITMAP_HEIGHT,
      bitmap: TEST_BITMAP.toString("base64"),
      pages,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
