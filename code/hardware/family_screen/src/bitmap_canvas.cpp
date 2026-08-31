#include "bitmap_canvas.h"

#include <ctype.h>
#include <stdlib.h>
#include <string.h>
#include "app_config.h"

namespace family {
namespace {
constexpr uint8_t kGlyphs[][7] = {
  {0,0,0,0,0,0,0}, {14,17,1,2,4,0,4},
  {14,17,19,21,25,17,14}, {4,12,4,4,4,4,14}, {14,17,1,2,4,8,31},
  {30,1,1,14,1,1,30}, {2,6,10,18,31,2,2}, {31,16,16,30,1,1,30},
  {14,16,16,30,17,17,14}, {31,1,2,4,8,8,8}, {14,17,17,14,17,17,14},
  {14,17,17,15,1,1,14},
  {14,17,17,31,17,17,17}, {30,17,17,30,17,17,30}, {14,17,16,16,16,17,14},
  {30,17,17,17,17,17,30}, {31,16,16,30,16,16,31}, {31,16,16,30,16,16,16},
  {14,17,16,23,17,17,15}, {17,17,17,31,17,17,17}, {14,4,4,4,4,4,14},
  {7,2,2,2,2,18,12}, {17,18,20,24,20,18,17}, {16,16,16,16,16,16,31},
  {17,27,21,21,17,17,17}, {17,25,21,19,17,17,17}, {14,17,17,17,17,17,14},
  {30,17,17,30,16,16,16}, {14,17,17,17,21,18,13}, {30,17,17,30,20,18,17},
  {15,16,16,14,1,1,30}, {31,4,4,4,4,4,4}, {17,17,17,17,17,17,14},
  {17,17,17,17,17,10,4}, {17,17,17,21,21,21,10}, {17,17,10,4,10,17,17},
  {17,17,10,4,4,4,4}, {31,1,2,4,8,16,31},
  {0,0,0,31,0,0,0}, {0,0,0,0,0,12,12}, {0,4,0,0,0,4,0}
};
constexpr uint8_t kSpace = 0, kQuestion = 1, kDigitStart = 2, kLetterStart = 12;
constexpr uint8_t kHyphen = 38, kDot = 39, kColon = 40;
}

void DirtyBounds::reset() { empty_ = true; }
void DirtyBounds::include(int16_t x, int16_t y, int16_t radius) {
  const int16_t l = x - radius, t = y - radius, r = x + radius, b = y + radius;
  if (empty_) { minX_ = l; minY_ = t; maxX_ = r; maxY_ = b; empty_ = false; return; }
  if (l < minX_) minX_ = l; if (t < minY_) minY_ = t;
  if (r > maxX_) maxX_ = r; if (b > maxY_) maxY_ = b;
}
Rect DirtyBounds::alignedRect() const {
  if (empty_) return {};
  int16_t l = minX_ < 0 ? 0 : minX_;
  int16_t t = minY_ < static_cast<int16_t>(kHeaderHeight) ? kHeaderHeight : minY_;
  int16_t r = maxX_ >= static_cast<int16_t>(kDisplayWidth) ? kDisplayWidth - 1 : maxX_;
  int16_t b = maxY_ >= static_cast<int16_t>(kDisplayHeight) ? kDisplayHeight - 1 : maxY_;
  l &= ~7; r = static_cast<int16_t>((r + 8) & ~7) - 1;
  if (r >= static_cast<int16_t>(kDisplayWidth)) r = kDisplayWidth - 1;
  return {l, t, static_cast<int16_t>(r - l + 1), static_cast<int16_t>(b - t + 1)};
}

void BitmapCanvas::clearWhite() { memset(pixels_, 0xFF, kFramebufferBytes); }
void BitmapCanvas::clearContentWhite() { memset(pixels_ + kHeaderHeight * kBytesPerRow, 0xFF, kContentBytes); }
bool BitmapCanvas::isBlack(int16_t x, int16_t y) const {
  if (x < 0 || y < 0 || x >= static_cast<int16_t>(kDisplayWidth) || y >= static_cast<int16_t>(kDisplayHeight)) return false;
  const size_t i = static_cast<size_t>(y) * kBytesPerRow + x / 8;
  return (pixels_[i] & (0x80U >> (x & 7))) == 0;
}
void BitmapCanvas::setPixel(int16_t x, int16_t y, bool black) {
  if (x < 0 || y < 0 || x >= static_cast<int16_t>(kDisplayWidth) || y >= static_cast<int16_t>(kDisplayHeight)) return;
  const size_t i = static_cast<size_t>(y) * kBytesPerRow + x / 8;
  const uint8_t mask = 0x80U >> (x & 7);
  if (black) pixels_[i] &= ~mask; else pixels_[i] |= mask;
}
void BitmapCanvas::fillCircle(int16_t cx, int16_t cy, int16_t radius, bool black) {
  for (int16_t y = -radius; y <= radius; ++y)
    for (int16_t x = -radius; x <= radius; ++x)
      if (x * x + y * y <= radius * radius + radius) setPixel(cx + x, cy + y, black);
}
void BitmapCanvas::drawLine(int16_t x0, int16_t y0, int16_t x1, int16_t y1,
                            int16_t radius, bool black, DirtyBounds* dirty) {
  const int16_t dx = abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
  const int16_t dy = -abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  int16_t error = dx + dy;
  for (;;) {
    if (y0 >= static_cast<int16_t>(kHeaderHeight)) {
      fillCircle(x0, y0, radius, black); if (dirty) dirty->include(x0, y0, radius);
    }
    if (x0 == x1 && y0 == y1) break;
    const int16_t twice = 2 * error;
    if (twice >= dy) { error += dy; x0 += sx; }
    if (twice <= dx) { error += dx; y0 += sy; }
  }
}
void BitmapCanvas::fillRect(int16_t x, int16_t y, int16_t w, int16_t h, bool black) {
  for (int16_t yy = y; yy < y + h; ++yy) for (int16_t xx = x; xx < x + w; ++xx) setPixel(xx, yy, black);
}
const uint8_t* BitmapCanvas::glyph(char c) {
  c = static_cast<char>(toupper(static_cast<unsigned char>(c)));
  if (c == ' ') return kGlyphs[kSpace];
  if (c >= '0' && c <= '9') return kGlyphs[kDigitStart + c - '0'];
  if (c >= 'A' && c <= 'Z') return kGlyphs[kLetterStart + c - 'A'];
  if (c == '-') return kGlyphs[kHyphen]; if (c == '.') return kGlyphs[kDot];
  if (c == ':') return kGlyphs[kColon]; return kGlyphs[kQuestion];
}
void BitmapCanvas::drawChar(int16_t x, int16_t y, char c, uint8_t scale) {
  const uint8_t* rows = glyph(c);
  for (uint8_t row = 0; row < 7; ++row) for (uint8_t col = 0; col < 5; ++col)
    if (rows[row] & (1U << (4 - col))) fillRect(x + col * scale, y + row * scale, scale, scale, true);
}
void BitmapCanvas::drawText(int16_t x, int16_t y, const char* text, uint8_t scale) {
  if (!text) return;
  while (*text && x + 5 * scale < static_cast<int16_t>(kDisplayWidth)) {
    drawChar(x, y, *text++, scale); x += 6 * scale;
  }
}
void BitmapCanvas::drawHeader(const char* label, bool showClearAction) {
  fillRect(0, 0, kDisplayWidth, kHeaderHeight, false);
  fillRect(0, kHeaderHeight - 2, kDisplayWidth, 2, true);
  drawText(12, 8, label ? label : "SEITE", 3);
  if (showClearAction) {
    // Redraw the action area so a long page label cannot run underneath it.
    fillRect(kHeaderClearActionLeft, 0, kHeaderClearActionWidth, kHeaderHeight - 2, false);
    fillRect(kHeaderClearActionLeft, 0, 2, kHeaderHeight, true);
    // A five-letter scale-3 label is 87 pixels wide including inter-letter gaps.
    constexpr int16_t kClearLabelWidth = 87;
    const int16_t clearLabelX = kHeaderClearActionLeft +
                                (kHeaderClearActionWidth - kClearLabelWidth) / 2;
    drawText(clearLabelX, 8, "CLEAR", 3);
  }
}
void BitmapCanvas::drawMessage(const char* line1, const char* line2) {
  clearContentWhite(); drawText(40, 180, line1 ? line1 : "BITTE EINEN MOMENT", 4);
  if (line2) drawText(40, 225, line2, 3);
}

}  // namespace family
