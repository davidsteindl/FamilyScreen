import { getContacts } from "../contacts";
import { renderHomescreen } from "./homescreen";
import { renderTestBitmap } from "./test-bitmap";
import { getWeather, OTTENSCHLAG, WIEN } from "../content/weather";

export type PageMeta = {
  type: "home" | "user";
  name: string;
  userId?: string;
};

export type Page = {
  meta: PageMeta;
  render: () => Promise<Uint8Array>;
};

/**
 * Derived from live state, so it is rendered per request instead of stored: a
 * saved copy would need invalidating on the weather, on a new message and on a
 * read one alike, all of it more work than drawing the 40 kB again.
 */
export async function renderHome() {
  const [primary, secondary] = await Promise.all([
    getWeather(OTTENSCHLAG),
    getWeather(WIEN),
  ]);

  // The render moment is the poll moment, which is what the header stamps.
  return renderHomescreen({
    renderedAt: new Date(),
    primary,
    secondary,
    // No calendar source yet; the day cell shows its empty state until there is one.
    events: [],
  });
}

/** The pages a device shows, in order. A new page type is one more entry here. */
export async function getPages(
  userId: string,
  userName: string,
): Promise<Page[]> {
  const contacts = await getContacts(userId);

  return [
    {
      meta: { type: "home" as const, name: userName },
      render: () => renderHome(),
    },
    ...contacts.map((contact) => ({
      meta: { type: "user" as const, ...contact },
      // ponytail: placeholder until messages can be composed, then this hands
      // back the stored messages.bitmapData instead of drawing anything.
      render: async () => renderTestBitmap(contact.name),
    })),
  ];
}
