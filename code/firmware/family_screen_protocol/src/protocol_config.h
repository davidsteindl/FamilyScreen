#pragma once

#include <stddef.h>
#include <stdint.h>

namespace family {

// These values are part of the device/server wire contract. Changing them
// requires a coordinated backend protocol change, not just a panel-driver edit.
constexpr uint16_t kDisplayWidth = 800;
constexpr uint16_t kDisplayHeight = 480;
constexpr uint16_t kHeaderHeight = 40;
constexpr uint16_t kContentHeight = kDisplayHeight - kHeaderHeight;
constexpr size_t kBytesPerRow = kDisplayWidth / 8;
constexpr size_t kFramebufferBytes = kBytesPerRow * kDisplayHeight;
constexpr size_t kContentBytes = kBytesPerRow * kContentHeight;
constexpr uint8_t kMaximumPages = 24;
constexpr const char kLocalDrawingPageId[] = "ottola";
constexpr const char kLocalDrawingPageLabel[] = "Ottola";

}  // namespace family
