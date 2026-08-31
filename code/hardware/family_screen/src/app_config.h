#pragma once

#include <stddef.h>
#include <stdint.h>
#include <protocol_config.h>

namespace family {

constexpr uint16_t kHeaderClearActionWidth = 128;
constexpr uint16_t kHeaderClearActionLeft = kDisplayWidth - kHeaderClearActionWidth;

constexpr uint8_t kTouchIrqPin = 36;
constexpr uint8_t kTouchSdaPin = 32;
constexpr uint8_t kTouchSclPin = 33;
constexpr uint8_t kEpdBusyPin = 13;
constexpr uint8_t kEpdResetPin = 12;
constexpr uint8_t kEpdDcPin = 14;
constexpr uint8_t kEpdCsPin = 27;
constexpr uint8_t kClearButtonPin = 25;
constexpr uint8_t kPageButtonPin = 26;

constexpr uint32_t kDrawingIdleUploadMs = 15UL * 1000UL;
constexpr uint32_t kStartupFailureRestartMs = 15UL * 60UL * 1000UL;
// A normal HTTPS operation is bounded to 45 seconds. Two minutes without any
// network-task progress therefore indicates a deadlock rather than an outage.
constexpr uint32_t kNetworkTaskStallRestartMs = 2UL * 60UL * 1000UL;
constexpr uint32_t kButtonDebounceMs = 45;
// Radius 1 ergibt einen kompakten, etwa drei Pixel breiten Stiftstrich.
constexpr uint8_t kBrushRadius = 1;

constexpr bool isHeaderClearAction(uint16_t x, uint16_t y) {
  return x >= kHeaderClearActionLeft && x < kDisplayWidth && y < kHeaderHeight;
}

// The UC8179 DDX setting is configured so its monochrome RAM uses the public
// bitmap format directly (1=white, 0=black) in full and partial modes.
#ifndef FAMILY_EPD_INVERT_TRANSFER_BITS
#define FAMILY_EPD_INVERT_TRANSFER_BITS 0
#endif

}  // namespace family
