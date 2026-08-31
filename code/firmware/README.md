# FamilyScreen reusable firmware

This directory contains device code that is intentionally independent of the
touch-to-e-paper implementation under `../hardware/family_screen`.

- `family_screen_protocol` is portable C++ and owns the exact bitmap/API
  dimensions plus manifest value types. It is used by device and native tests.
- `family_screen_services` owns LittleFS caching, the drawing upload outbox,
  HTTP synchronization, Wi-Fi/TLS setup, and public CA trust anchors.

The hardware PlatformIO project consumes both as explicit local `lib_deps`.
During the hardware rewrite, keep the 44,000-byte content bitmap convention and
the service APIs stable. Change this directory only for protocol, persistence,
networking, certificate rotation, or other non-rendering work.
