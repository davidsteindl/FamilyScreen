import requireDevice from "@/lib/auth/require-device";
import { getContacts } from "@/lib/contacts";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const device = await requireDevice(req);

  if (!device) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const others = await getContacts(device.userId);

  const pages = [
    { type: "home" as const },
    ...others.map((user) => ({ type: "user" as const, ...user })),
  ];

  return Response.json(
    { pageCount: pages.length, pages },
    { headers: { "Cache-Control": "no-store" } },
  );
}
