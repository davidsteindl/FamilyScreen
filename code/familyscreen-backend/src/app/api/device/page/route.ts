import requireDevice from "@/lib/auth/require-device";
import { getPages } from "@/lib/screen/pages";

export const runtime = "nodejs";

/**
 * One page as raw bytes, so the device reads straight into its framebuffer:
 * no JSON, no base64, no decoder. Only the requested page is rendered.
 */
export async function GET(req: Request) {
  const device = await requireDevice(req);

  if (!device) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const index = Number(new URL(req.url).searchParams.get("index"));
  const pages = await getPages(device.userId, device.userName);

  if (!Number.isInteger(index) || index < 0 || index >= pages.length) {
    return Response.json({ error: "Not Found" }, { status: 404 });
  }

  // Buffer at the wire boundary: a plain Uint8Array is not a BodyInit, and this
  // route is nodejs anyway. No copy of the pixels is made.
  const bytes = Buffer.from(await pages[index].render());

  return new Response(bytes, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Cache-Control": "no-store",
    },
  });
}
