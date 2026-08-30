import requireDevice from "@/lib/auth/require-device";
import { getPages } from "@/lib/pages";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const device = await requireDevice(req);

  if (!device) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const pages = (await getPages(device.userId, device.userName)).map(
    (page) => page.meta,
  );

  return Response.json(
    {
      pageCount: pages.length,
      pages,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
