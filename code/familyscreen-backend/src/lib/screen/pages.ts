import { getContacts } from "../contacts";
import { latestMessageFor } from "../messages";
import { renderHomescreen } from "./homescreen";
import { renderMessage } from "./message";
import { getEvents } from "../content/events";
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
  // The render moment is the poll moment, which is what the header stamps.
  const renderedAt = new Date();

  const [primary, secondary, events] = await Promise.all([
    getWeather(OTTENSCHLAG),
    getWeather(WIEN),
    // The calendar is optional: without it the day cell shows its empty state.
    getEvents(renderedAt).catch(() => []),
  ]);

  return renderHomescreen({ renderedAt, primary, secondary, events });
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
      // Lazy on purpose: /metadata never pays for this, and /page pays for one.
      // One query per contact. A DISTINCT ON (sender_user_id) would make it a
      // single query, worth doing only once contact lists get long.
      render: async () =>
        (await latestMessageFor(contact.userId, userId)) ??
        renderMessage({
          from: contact.name,
          sentAt: new Date(),
          text: "NOCH KEINE NACHRICHT",
        }),
    })),
  ];
}
