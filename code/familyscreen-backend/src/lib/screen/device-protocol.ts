import { createHash } from "node:crypto";

import { BITMAP_BYTES } from "./bitmap";
import { sha256Hex } from "./device-wire";
import { getPages, type Page, type PageMeta } from "./pages";

export { etagMatches, readExactBody, sha256Hex, strongEtag } from "./device-wire";

export type RenderedDevicePage = PageMeta & {
  revision: string;
  sha256: string;
  bitmap: Uint8Array;
};

/**
 * The hash is the device's cache key, so it is taken over the exact bytes that
 * go on the wire. A page of the wrong length would desynchronise the firmware's
 * framebuffer rather than draw wrong, so it fails loudly here instead.
 */
async function renderForDevice(page: Page): Promise<RenderedDevicePage> {
  const bitmap = await page.render();

  if (bitmap.byteLength !== BITMAP_BYTES) {
    throw new Error(
      `Page ${page.meta.id} rendered ${bitmap.byteLength} bytes; expected ${BITMAP_BYTES}`,
    );
  }

  const sha256 = sha256Hex(bitmap);

  return { ...page.meta, revision: sha256.slice(0, 16), sha256, bitmap };
}

export async function getRenderedDevicePages(userId: string, userName: string) {
  return Promise.all((await getPages(userId, userName)).map(renderForDevice));
}

export async function getRenderedDevicePage(
  userId: string,
  userName: string,
  pageId: string,
) {
  const page = (await getPages(userId, userName)).find(
    (candidate) => candidate.meta.id === pageId,
  );

  return page ? renderForDevice(page) : null;
}

export function createManifestRevision(
  pages: Pick<RenderedDevicePage, "id" | "label" | "kind" | "sha256">[],
) {
  const canonical = pages
    .map((page) => `${page.id}\0${page.label}\0${page.kind}\0${page.sha256}`)
    .join("\n");

  return createHash("sha256").update(canonical).digest("hex");
}
