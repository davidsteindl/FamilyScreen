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
npm run dev
```

Open `http://localhost:3000`. The web UI is intentionally unchanged; the
existing Create homescreen route still previews its homescreen bitmap.

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
