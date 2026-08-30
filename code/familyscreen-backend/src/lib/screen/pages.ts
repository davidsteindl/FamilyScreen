import { getContacts } from "../contacts";
import { getEvents } from "../content/events";
import { getWeather, mockWeather, OTTENSCHLAG, WIEN } from "../content/weather";
import { latestMessageFor } from "../messages";
import { renderHomescreen } from "./homescreen";
import { renderMessage } from "./message";

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

const BUCKET_MS = 15 * 60 * 1000;

/**
 * A 15-minute bucket rather than the wall clock: /metadata hashes every page to
 * build the manifest, and the device then downloads with If-Match. A timestamp
 * that ticks between those two requests would 412 on every poll.
 */
function renderClock() {
  return new Date(Math.floor(Date.now() / BUCKET_MS) * BUCKET_MS);
}

/**
 * Derived from live state, so it is rendered per request instead of stored: a
 * saved copy would need invalidating on the weather, on a new message and on a
 * read one alike, all of it more work than drawing the 44 kB again.
 */
export async function renderHome() {
  const renderedAt = renderClock();

  // Live weather and calendar data remain authoritative. Each source falls
  // back independently so one unavailable provider cannot blank the screen.
  const [primary, secondary, events] = await Promise.all([
    getWeather(OTTENSCHLAG).catch(() => mockWeather(OTTENSCHLAG)),
    getWeather(WIEN).catch(() => mockWeather(WIEN)),
    getEvents(renderedAt).catch(() => []),
  ]);

  return renderHomescreen({ renderedAt, primary, secondary, events });
}

/** The pages a device shows, in order. A new page type is one more entry here. */
export async function getPages(
  userId: string,
  userName: string,
): Promise<Page[]> {
  const contacts = (await getContacts(userId)).slice(0, MAX_SERVER_PAGES - 1);

  return [
    {
      meta: { id: "home", label: userName, kind: "readonly" as const },
      render: () => renderHome(),
    },
    ...contacts.map((contact) => ({
      meta: {
        id: contact.userId,
        label: contact.name.slice(0, MAX_LABEL_CHARACTERS),
        kind: "readonly" as const,
      },
      // One query per contact, and /metadata pays for all of them because it
      // hashes each page. A DISTINCT ON (sender_user_id) would collapse it into
      // one query, worth doing only once contact lists get long.
      render: async () =>
        (await latestMessageFor(contact.userId, userId)) ??
        renderMessage({
          from: contact.name,
          sentAt: renderClock(),
          text: "NOCH KEINE NACHRICHT",
        }),
    })),
  ];
}
