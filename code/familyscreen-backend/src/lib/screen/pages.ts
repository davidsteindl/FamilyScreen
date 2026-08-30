import { getContacts } from "../contacts";
import { getEvents } from "../content/events";
import { getLatestInboundMessage } from "../messages";
import { BITMAP_BYTES } from "./bitmap";
import { renderHomescreen } from "./homescreen";
import { renderMockMessage } from "./message-screen";
import {
  getWeather,
  mockWeather,
  OTTENSCHLAG,
  WIEN,
} from "../content/weather";

export type PageMeta = {
  id: string;
  label: string;
  kind: "readonly";
};

export type Page = {
  meta: PageMeta;
  render: () => Promise<Uint8Array>;
};

// Firmware reserves slot 24 for its local Ottola drawing page.
const MAX_SERVER_PAGES = 23;
const MAX_LABEL_CHARACTERS = 64;

/**
 * Derived from live state, so it is rendered per request instead of stored: a
 * saved copy would need invalidating on the weather, on a new message and on a
 * read one alike, all of it more work than drawing the 40 kB again.
 */
export async function renderHome() {
  // A 15-minute bucket makes metadata and the following binary download the
  // same representation even when those requests straddle a minute boundary.
  const renderedAt = new Date(
    Math.floor(Date.now() / (15 * 60 * 1000)) * 15 * 60 * 1000,
  );

  // Live weather and calendar data remain authoritative. Each source falls
  // back independently so one unavailable provider cannot blank the screen.
  const [primary, secondary, events] = await Promise.all([
    getWeather(OTTENSCHLAG).catch(() => mockWeather(OTTENSCHLAG)),
    getWeather(WIEN).catch(() => mockWeather(WIEN)),
    getEvents(renderedAt).catch(() => [
      "09:30 Arzttermin",
      "15:00 Kaffee mit Anna",
    ]),
  ]);

  return renderHomescreen({
    renderedAt,
    primary,
    secondary,
    events,
  });
}

/** The pages a device shows, in order. A new page type is one more entry here. */
export async function getPages(
  userId: string,
  userName: string,
): Promise<Page[]> {
  const contacts = (await getContacts(userId)).slice(0, MAX_SERVER_PAGES - 1);

  return [
    {
      meta: { id: "home", label: "Home", kind: "readonly" as const },
      render: () => renderHome(),
    },
    ...contacts.map((contact) => ({
      meta: {
        id: contact.userId,
        label: contact.name.slice(0, MAX_LABEL_CHARACTERS),
        kind: "readonly" as const,
      },
      render: async () => {
        const message = await getLatestInboundMessage(userId, contact.userId);

        return message?.bitmapData?.byteLength === BITMAP_BYTES
          ? new Uint8Array(message.bitmapData)
          : renderMockMessage(contact.name, userName);
      },
    })),
  ];
}
