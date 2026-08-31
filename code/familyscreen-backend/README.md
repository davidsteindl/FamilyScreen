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

- Nothing reaches the device without an explicit approval. The 260 seeded
  candidates start as pending; the fallback when nothing is approved is a
  neutral status line, never an unreviewed text.
- **Write your own daily message** on the same page adds a text of your own. It
  is stored as approved right away, records the signed-in user as its reviewer
  and gets the category `family`.
- Every text is capped at 110 characters and must consist of characters the
  device font can draw. `dailyMessageProblems` in
  `src/lib/daily-message/rules.ts` is the single source for that rule:
  it backs the live hint in the form, the server action and the database CHECK
  constraint in `src/db/schema.ts`.
- The first request of a Vienna calendar day claims exactly one approved entry
  for that date, so every device sees the same text all day. Entries never shown
  come first, then the least recently used. A unique constraint on the date
  column enforces one message per day even under concurrent requests.
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
