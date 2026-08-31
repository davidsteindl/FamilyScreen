#pragma once

#include <stdint.h>
#include "family_types.h"

namespace family {

class DirtyBounds {
 public:
  void reset();
  void include(int16_t x, int16_t y, int16_t radius = 0);
  Rect alignedRect() const;
  bool empty() const { return empty_; }
 private:
  bool empty_ = true;
  int16_t minX_ = 0, minY_ = 0, maxX_ = 0, maxY_ = 0;
};

class BitmapCanvas {
 public:
  explicit BitmapCanvas(uint8_t* pixels) : pixels_(pixels) {}
  void clearWhite();
  void clearContentWhite();
  bool isBlack(int16_t x, int16_t y) const;
  void setPixel(int16_t x, int16_t y, bool black);
  void fillCircle(int16_t cx, int16_t cy, int16_t radius, bool black);
  void drawLine(int16_t x0, int16_t y0, int16_t x1, int16_t y1,
                int16_t radius, bool black, DirtyBounds* dirty = nullptr);
  void drawHeader(const char* label, bool showClearAction = false);
  void drawMessage(const char* line1, const char* line2 = nullptr);
 private:
  void fillRect(int16_t x, int16_t y, int16_t width, int16_t height, bool black);
  void drawChar(int16_t x, int16_t y, char c, uint8_t scale);
  void drawText(int16_t x, int16_t y, const char* text, uint8_t scale);
  static const uint8_t* glyph(char c);
  uint8_t* pixels_;
};

}  // namespace family
