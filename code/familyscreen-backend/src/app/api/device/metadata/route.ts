import requireDevice from "@/lib/auth/require-device";
import {
  createManifestRevision,
  etagMatches,
  getRenderedDevicePages,
  strongEtag,
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
  const pages = renderedPages.map((page) => ({
    id: page.id,
    label: page.label,
    kind: page.kind,
    revision: page.revision,
    sha256: page.sha256,
  }));
  const manifestRevision = createManifestRevision(renderedPages);
  const etag = strongEtag(manifestRevision);
  const headers = {
    ETag: etag,
    "Cache-Control": "private, no-cache, must-revalidate",
    Vary: "Authorization",
  };

  if (etagMatches(req.headers.get("if-none-match"), etag)) {
    return new Response(null, { status: 304, headers });
  }

  return Response.json(
    {
      manifestRevision,
      pages,
    },
    { headers },
  );
}
