# FamilyScreen backend

Next.js backend and existing web UI for synchronizing an ESP32 FamilyScreen.

## Local setup

The repository requires Node `24.20.0` (see `.node-version`). Older Node
versions can leave this dependency tree only partly installed.

```powershell
npm ci
Copy-Item .env.example .env.local
# Fill in .env.local, then:
npm run db:migrate
npm run db:seed-content
npm run dev
```

Open `http://localhost:3000`. The web UI is intentionally unchanged; the
existing Create homescreen route still previews its homescreen bitmap.

## Daily messages

The right-hand column of the homescreen shows one short German text per day,
stored in the `daily_messages` table. `/daily-messages` is the review page.

Each text is written by Gemini for one specific day, so it can refer to that
day's calendar entry or to weather worth mentioning. The 260 seeded texts are
no longer the supply; they are the tone sample the model is shown and the
fallback whenever generation is off or unreachable.

- The first request of a Vienna calendar day makes sure **tomorrow's** text is
  already written. Generating a day ahead is what gives the family an evening to
  read it on `/daily-messages` and press **Regenerate** before it reaches the
  wall. There is no scheduler: a unique constraint on the date column means one
  message owns each date, and the device's own poll does the work.
- At most one date is filled per request, so a cold start cannot spend two model
  calls inside one device poll.
- **A generated text is shown before any human has seen it.** That is the point
  of the change, and the earlier rule that nothing reaches the device without an
  explicit approval no longer holds for these rows. What stands in its place:
  the prompt rules, the shared 110-character device-font validator, a tighter
  80-character cap on generated text so the column does not shrink, the
  day-ahead preview, and Reject or Regenerate.
- Generated rows carry the category `generated` and are **never** returned to
  the reusable pool. "Heute wird es stark regnen" is false under every other
  sky, and re-electing it months later is exactly the kind of invention this
  screen refuses to make.
- Without `GEMINI_API_KEY` nothing is generated and the approved corpus behaves
  exactly as it did before. That is the supported off switch, and it is also how
  local development runs without an account.
- Keep some seeded texts approved. They are the only fallback when Gemini is
  unreachable; with an empty pool the screen falls back to the neutral status
  line instead.
- **Write your own daily message** on the same page adds a text of your own. It
  is stored as approved right away, records the signed-in user as its reviewer
  and gets the category `family`. One of these leads the three-text tone sample
  the model is shown, and the seeds fill the rest: what the family writes is the
  voice worth copying, but it must not become the only voice the model ever
  hears.
- Every text is capped at 110 characters and must consist of characters the
  device font can draw. `dailyMessageProblems` in
  `src/lib/daily-message/rules.ts` is the single source for that rule:
  it backs the live hint in the form, the server action and the database CHECK
  constraint in `src/db/schema.ts`.
- When generation is off or fails, an approved entry claims the date instead:
  entries never shown come first, then the least recently used. It claims the
  date rather than leaving it open for a retry, because an open date would call
  the model again on every poll of the day and could change the wall text in
  the middle of the afternoon. Regenerate is the way back from that.
- Deleting takes two steps: reject first, then delete from the Rejected filter.
  The server refuses to delete anything that is not already rejected.

The seed texts were written independently and are only inspired by public
dictionaries of Austrian German. Each entry carries its own source name and URL
in `src/db/seed-content-data.ts`; the review page links them per card.

Weather comes from Open-Meteo and is cached for 15 minutes. If it is unreachable,
the homescreen still renders using deterministic mock weather. Appointments and
messages have no stand-in: an empty calendar says so, and a contact who has not
written yet gets a page saying that. Inventing an appointment on a family screen
is worse than showing none.

The same rule binds the model, more strictly. It is forbidden to invent a date,
a time, a place, a name, a number or a forecast that is not in the data it was
given, and when Open-Meteo is unreachable it is given no weather at all rather
than the mock the renderer draws: a screen may show a stand-in, a sentence may
not state one as fact. Its weather comes from the day's representative WMO code
rather than the current instant, because a line written shortly after midnight
would otherwise read the night sky and never mention the afternoon storm.

Calendar summaries reach the prompt inside a delimited block marked as data, and
are capped at five lines of 80 characters. The delimiter is not the guard; the
output validator is. The worst an entry in the feed can achieve is 80 characters
of font-legal German on one screen for one day, removable with one button.

**Privacy:** the household names, the `HOUSEHOLD_CONTEXT` note, that day's
calendar summaries and the Ottenschlag forecast are sent to Google on each
generation. The AI Studio free tier is not zero-retention. Leaving
`GEMINI_API_KEY` unset sends nothing.

## Device setup

Set the firmware's `FAMILY_API_BASE_URL` to the backend's `/api` base, for
example `https://familyscreen.example/api`, and set
`FAMILY_LOCAL_DEMO_MODE` to `0`. Copy the one-time bearer token printed by
`npm run db:seed` into the firmware secrets file.

Production device traffic must use HTTPS. TLS encrypts the request and response;
an additional custom encryption layer would not improve transport security and
would complicate key rotation. Device bearer tokens are random and only their
SHA-256 hashes are stored in the database.

### Page synchronization

- `GET /api/device/metadata` returns an ordered manifest containing `id`,
  `label`, `kind`, `revision`, and `sha256` for every page. It supports strong
  `ETag` and `If-None-Match`; unchanged manifests return `304`.
- `GET /api/device/pages/{pageId}/bitmap` returns exactly 44,000 raw bytes as
  `application/octet-stream`: 800x440, row-major, MSB first, `1 = white`,
  `0 = black`. The firmware renders its own 40-pixel page header.
- Downloads include `If-Match` with the manifest SHA-256. A page changed between
  the manifest and bitmap request returns `412` instead of caching mismatched
  bytes.
- `GET /api/device/full` is a browser/debug endpoint and is the only endpoint
  that embeds base64. The physical device never uses it.

### Drawings from the device

`PUT /api/device/pages/ottola/bitmap` accepts the same 44,000-byte binary
format. `Content-Type: application/octet-stream`, `X-Content-SHA256`, and an
equal `Idempotency-Key` are required. The server streams into a fixed-size
buffer, verifies length and SHA-256, then inserts one inbox delivery for each
configured contact. The database uniqueness constraint makes ESP32 retries safe.

## Checks

```powershell
npm test
npm run lint
npm run build
```

Firmware host tests are run from `../hardware/family_screen` with
`pio test -e native`.
