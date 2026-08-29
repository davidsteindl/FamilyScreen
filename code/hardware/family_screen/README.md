# Family e-ink screen firmware

Offline-first firmware for the LOLIN32, an 800×480 UC8179 monochrome e-ink panel, and a GT911 touch controller.

## Configure and build

1. Copy `include/secrets.example.h` to `include/secrets.h` and enter the Wi-Fi, device API, bearer token, and CA-certificate values. The real secrets file is ignored by Git.
2. Build with `pio run` and upload with `pio run --target upload`.
3. Watch the first twenty touch samples at 115200 baud. If the reported screen coordinates do not match the touched corners, set `FAMILY_TOUCH_SWAP_XY`, `FAMILY_TOUCH_MIRROR_X`, or `FAMILY_TOUCH_MIRROR_Y` in `platformio.ini` build flags.
4. Run host-side logic tests with `pio test -e native`.

Define `FAMILY_DEBUG_FAST_SYNC` as a build flag to change the synchronization interval from ten minutes to fifteen seconds. Plain HTTP is rejected unless `FAMILY_ALLOW_INSECURE_HTTP` is explicitly enabled in the local secrets file.

With `FAMILY_LOCAL_DEMO_MODE` set to `1`, no API requests are made. The firmware presents local Home, Ottola, Tobias, and David pages; Ottola's drawing remains persistent in LittleFS. Set it to `0` when the API becomes available.

## Device API

All requests use `Authorization: Bearer <device token>` when a token is configured.

`GET /v1/devices/{deviceId}/pages` returns an ordered manifest and supports `If-None-Match`/`ETag`:

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

The manifest contains 1–23 server-owned pages with unique IDs containing only letters, digits, `_` or `-`. A server-declared `drawing` page is supported for compatibility, but is normally omitted: firmware appends its device-owned `ottola` drawing page after all imported pages.

`GET /v1/devices/{deviceId}/pages/{pageId}/bitmap` returns exactly 44,000 bytes as `application/octet-stream`. It is an 800×440 row-major bitmap: the most significant bit is the leftmost pixel, `1` is white, and `0` is black. Firmware adds the 40-pixel label header.

`PUT /v1/devices/{deviceId}/pages/{drawingPageId}/bitmap` accepts the same payload. The device supplies `X-Content-SHA256` and uses that hash as `Idempotency-Key`. Any 2xx response acknowledges the snapshot; the following manifest request supplies its server revision.

## Runtime behavior

- Cached pages switch without waiting for the network. A page-button press also requests a background synchronization.
- New remote content is cached but does not interrupt the currently visible page; it appears on the next visit.
- Drawing uses the first GT911 contact ID until it lifts and ignores other contacts. Dirty areas refresh after each completed stroke.
- Drawings are saved/uploaded after five idle seconds or before leaving the page. Failed uploads remain in LittleFS and retry with exponential backoff.
- Clear affects only the drawing page. Full page changes and every twentieth drawing update use a full refresh to limit ghosting.

The checked-in hardware profile currently maps the portrait GT911 coordinates to landscape as `screenX = 799 - rawY`, `screenY = rawX`. Full refresh bytes are inverted for this UC8179 panel, while partial refresh bytes use framebuffer polarity directly. The in-memory/API bitmap convention remains `1 = white`, `0 = black`.
