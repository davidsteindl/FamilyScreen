#pragma once

#include <stdint.h>
#include <stddef.h>
#include "app_config.h"

namespace family {

enum class PageKind : uint8_t { ReadOnly, Drawing };

struct PageDescriptor {
  char id[65] = {};
  char label[65] = {};
  char revision[65] = {};
  char sha256[65] = {};
  PageKind kind = PageKind::ReadOnly;
};

struct PageManifest {
  char revision[65] = {};
  char etag[96] = {};
  uint8_t count = 0;
  PageDescriptor pages[kMaximumPages];
  int find(const char* pageId) const;
  int drawingIndex() const;
};

struct Rect {
  int16_t x = 0;
  int16_t y = 0;
  int16_t width = 0;
  int16_t height = 0;
  Rect() = default;
  Rect(int16_t xValue, int16_t yValue, int16_t widthValue, int16_t heightValue)
      : x(xValue), y(yValue), width(widthValue), height(heightValue) {}
  bool empty() const { return width <= 0 || height <= 0; }
};

struct TouchContact { uint8_t id = 0; uint16_t x = 0; uint16_t y = 0; };
struct TouchFrame { uint8_t count = 0; TouchContact contacts[5]; };

}  // namespace family
