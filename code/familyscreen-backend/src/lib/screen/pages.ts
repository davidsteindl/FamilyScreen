import { getContacts } from "../messaging/contacts";
import { getEvents } from "../content/events";
import { getWeather, mockWeather, OTTENSCHLAG, WIEN } from "../content/weather";
import { latestMessagesTo } from "../messaging/messages";
import { fallbackDailyMessage } from "../daily-message/selection";
import { getDailyMessage } from "../daily-message/queries";
import { renderHomescreen } from "./homescreen";
import { renderNoMessage } from "./message";

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
  const [primary, secondary, events, dailyMessage] = await Promise.all([
    getWeather(OTTENSCHLAG).catch(() => mockWeather(OTTENSCHLAG)),
    getWeather(WIEN).catch(() => mockWeather(WIEN)),
    getEvents(renderedAt).catch(() => []),
    getDailyMessage(renderedAt)
      .then((message) => message?.text ?? fallbackDailyMessage())
      .catch(() => fallbackDailyMessage()),
  ]);

  return renderHomescreen({
    renderedAt,
    primary,
    secondary,
    events,
    dailyMessage,
  });
}

/** The pages a device shows, in order. A new page type is one more entry here. */
export async function getPages(
  userId: string,
  userName: string,
): Promise<Page[]> {
  const contacts = (await getContacts(userId)).slice(0, MAX_SERVER_PAGES - 1);

  // Started by whichever contact page renders first and shared by the rest:
  // /metadata hashes every page and would otherwise pay one query per contact,
  // while a bitmap request for the homescreen alone still pays none.
  let latest: ReturnType<typeof latestMessagesTo> | undefined;
  const latestMessages = () => (latest ??= latestMessagesTo(userId));

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
      render: async () =>
        (await latestMessages()).get(contact.userId)?.bitmap ??
        renderNoMessage(contact.name, renderClock()),
    })),
  ];
}
