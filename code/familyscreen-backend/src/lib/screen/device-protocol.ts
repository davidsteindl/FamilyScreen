import { createHash } from "node:crypto";

import { BITMAP_BYTES } from "./bitmap";
import { sha256Hex } from "./device-wire";
import { getPages, type PageMeta } from "./pages";

export { etagMatches, readExactBody, sha256Hex, strongEtag } from "./device-wire";

export type RenderedDevicePage = PageMeta & {
  revision: string;
  sha256: string;
  bitmap: Uint8Array;
};

export async function getRenderedDevicePages(
  userId: string,
  userName: string,
) {
  return Promise.all(
    (await getPages(userId, userName)).map(async (page) => {
      const bitmap = await page.render();

      if (bitmap.byteLength !== BITMAP_BYTES) {
        throw new Error(
          `Page ${page.meta.id} rendered ${bitmap.byteLength} bytes; expected ${BITMAP_BYTES}`,
        );
      }

      const sha256 = sha256Hex(bitmap);

      return {
        ...page.meta,
        revision: sha256.slice(0, 16),
        sha256,
        bitmap,
      } satisfies RenderedDevicePage;
    }),
  );
}

export async function getRenderedDevicePage(
  userId: string,
  userName: string,
  pageId: string,
) {
  const page = (await getPages(userId, userName)).find(
    (candidate) => candidate.meta.id === pageId,
  );

  if (!page) {
    return null;
  }

  const bitmap = await page.render();

  if (bitmap.byteLength !== BITMAP_BYTES) {
    throw new Error(
      `Page ${page.meta.id} rendered ${bitmap.byteLength} bytes; expected ${BITMAP_BYTES}`,
    );
  }

  const sha256 = sha256Hex(bitmap);

  return {
    ...page.meta,
    revision: sha256.slice(0, 16),
    sha256,
    bitmap,
  } satisfies RenderedDevicePage;
}

export function createManifestRevision(
  pages: Pick<RenderedDevicePage, "id" | "label" | "kind" | "sha256">[],
) {
  const canonical = pages
    .map((page) => `${page.id}\0${page.label}\0${page.kind}\0${page.sha256}`)
    .join("\n");

  return createHash("sha256").update(canonical).digest("hex");
}
