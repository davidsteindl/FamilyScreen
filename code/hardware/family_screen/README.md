# Family e-ink screen firmware

Offline-first firmware for the LOLIN32, an 800×480 UC8179 monochrome e-ink panel, and a GT911 touch controller.

## Configure and build

1. Copy `include/secrets.example.h` to `include/secrets.h` and enter the Wi-Fi, API base URL, and bearer token. The real secrets file is ignored by Git. The checked-in ISRG Root X1 certificate validates the current Let's Encrypt API certificate; do not enable insecure HTTPS.
2. Build with `pio run` and upload with `pio run --target upload`.
3. Watch the first twenty touch samples at 115200 baud. If the reported screen coordinates do not match the touched corners, set `FAMILY_TOUCH_SWAP_XY`, `FAMILY_TOUCH_MIRROR_X`, or `FAMILY_TOUCH_MIRROR_Y` in `platformio.ini` build flags.
4. Run host-side logic tests with `pio test -e native`.

Define `FAMILY_DEBUG_FAST_SYNC` as a build flag to change the synchronization interval from ten minutes to fifteen seconds. Plain HTTP is rejected unless `FAMILY_ALLOW_INSECURE_HTTP` is explicitly enabled in the local secrets file.

With `FAMILY_LOCAL_DEMO_MODE` set to `1`, no API requests are made. The firmware presents local Home, Ottola, Tobias, and David pages; Ottola's drawing remains persistent in LittleFS. Set it to `0` when the API becomes available.

## Device API

All requests use `Authorization: Bearer <device token>` when a token is configured. The token identifies the device, so the device ID does not need to be repeated in each URL.

`GET /api/device/metadata` returns an ordered manifest and supports `If-None-Match`/`ETag`:

```json
{
  "manifestRevision": "42",
  "pages": [
    {
      "id": "home",
      "label": "Home",
      "kind": "readonly",
      "revision": "18",
      "sha256": "64-lowercase-hex-characters"
    },
    {
      "id": "oma",
      "label": "Oma",
      "kind": "drawing",
      "revision": "7",
      "sha256": "64-lowercase-hex-characters"
    }
  ]
}
```

The manifest contains 1–23 server-owned pages with unique IDs of at most 64 characters containing only letters, digits, `_` or `-`. A server-declared `drawing` page is supported for compatibility, but is normally omitted: firmware appends its device-owned `ottola` drawing page after all imported pages.

`GET /api/device/pages/{pageId}/bitmap` returns exactly 44,000 raw bytes as `application/octet-stream`. It is an 800×440 row-major bitmap: the most significant bit is the leftmost pixel, `1` is white, and `0` is black. Firmware adds the 40-pixel label header. Do not base64-encode this response: base64 is larger and the packed binary is already compact.

`PUT /api/device/pages/{drawingPageId}/bitmap` accepts the same payload. The device supplies `X-Content-SHA256` and uses that hash as `Idempotency-Key`. Any 2xx response acknowledges the snapshot; the following manifest request supplies its server revision.

`GET /api/device/full` is a temporary debugging endpoint that embeds base64 bitmaps. Production firmware does not use it.

## Runtime behavior

- Cached pages switch without waiting for the network. A page-button press also requests a background synchronization.
- New remote content is cached in the background. If the currently visible page changed, it refreshes automatically after the completed synchronization; changes to other pages appear on the next visit.
- Drawing uses the first GT911 contact ID until it lifts and ignores other contacts. Dirty areas refresh after each completed stroke.
- Drawings are saved/uploaded after fifteen idle seconds or before leaving the page. Failed uploads remain in LittleFS and retry with exponential backoff.
- Wi-Fi connection attempts are bounded to twenty seconds. The radio is rebuilt between attempts and retries forever with a delay that grows from five seconds to five minutes. A lost connection never removes cached pages or queued drawings.
- API failures retry with bounded exponential backoff instead of hammering the server. Successful manifests are checked every ten minutes; page-button activity requests an immediate background check.
- The Arduino loop watchdog and a separate network-task heartbeat recover deadlocks by rebooting. All page data and the upload outbox live in LittleFS, so a recovery reboot remains offline-safe.
- Clear affects only the drawing page. Clear and normal page changes use fast differential updates; startup and every twentieth differential update use a full cleanup refresh to limit ghosting.

The checked-in hardware profile uses the GT911 landscape coordinates without swapping or mirroring. Full and partial updates use the same in-memory/API bitmap convention: `1 = white`, `0 = black`.
