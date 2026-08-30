#pragma once

#include <stddef.h>
#include <stdint.h>

namespace family {

constexpr uint16_t kDisplayWidth = 800;
constexpr uint16_t kDisplayHeight = 480;
constexpr uint16_t kHeaderHeight = 40;
constexpr uint16_t kContentHeight = kDisplayHeight - kHeaderHeight;
constexpr size_t kBytesPerRow = kDisplayWidth / 8;
constexpr size_t kFramebufferBytes = kBytesPerRow * kDisplayHeight;
constexpr size_t kContentBytes = kBytesPerRow * kContentHeight;
// Keep enough LittleFS headroom for an atomic page replacement and the
// drawing upload copy. Read-only downloads stop before consuming this reserve.
constexpr size_t kStorageSafetyReserveBytes = 2 * kContentBytes + 16 * 1024;
constexpr uint8_t kMaximumPages = 24;
constexpr const char kLocalDrawingPageId[] = "ottola";
constexpr const char kLocalDrawingPageLabel[] = "Ottola";

constexpr uint8_t kTouchIrqPin = 36;
constexpr uint8_t kTouchSdaPin = 32;
constexpr uint8_t kTouchSclPin = 33;
constexpr uint8_t kEpdBusyPin = 13;
constexpr uint8_t kEpdResetPin = 12;
constexpr uint8_t kEpdDcPin = 14;
constexpr uint8_t kEpdCsPin = 27;
constexpr uint8_t kClearButtonPin = 25;
constexpr uint8_t kPageButtonPin = 26;

constexpr uint32_t kProductionSyncIntervalMs = 10UL * 60UL * 1000UL;
constexpr uint32_t kDebugSyncIntervalMs = 15UL * 1000UL;
constexpr uint32_t kDrawingIdleUploadMs = 5UL * 1000UL;
constexpr uint32_t kButtonDebounceMs = 45;
// Radius 1 ergibt einen kompakten, etwa drei Pixel breiten Stiftstrich.
constexpr uint8_t kBrushRadius = 1;
constexpr uint8_t kPartialRefreshLimit = 20;

// The UC8179 DDX setting is configured so its monochrome RAM uses the public
// bitmap format directly (1=white, 0=black) in full and partial modes.
#ifndef FAMILY_EPD_INVERT_TRANSFER_BITS
#define FAMILY_EPD_INVERT_TRANSFER_BITS 0
#endif

#ifdef FAMILY_DEBUG_FAST_SYNC
constexpr uint32_t kSyncIntervalMs = kDebugSyncIntervalMs;
#else
constexpr uint32_t kSyncIntervalMs = kProductionSyncIntervalMs;
#endif

}  // namespace family
