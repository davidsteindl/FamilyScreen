#include "touch_controller.h"

#include <Arduino.h>
#include "GT911.h"
#include "app_config.h"

#ifndef FAMILY_TOUCH_SWAP_XY
#define FAMILY_TOUCH_SWAP_XY 0
#endif
#ifndef FAMILY_TOUCH_MIRROR_X
#define FAMILY_TOUCH_MIRROR_X 0
#endif
#ifndef FAMILY_TOUCH_MIRROR_Y
#define FAMILY_TOUCH_MIRROR_Y 0
#endif

namespace family {

bool TouchController::begin() {
  pinMode(kTouchIrqPin, INPUT);
  const bool ok = GT9XX_Initial() == SUCCESS;
  Serial.printf("Beruehrung: IRQ=%d SDA=%d SCL=%d, Reset nur beim Einschalten, Achsentausch=%d SpiegelX=%d SpiegelY=%d\n",
                kTouchIrqPin, kTouchSdaPin, kTouchSclPin,
                FAMILY_TOUCH_SWAP_XY, FAMILY_TOUCH_MIRROR_X, FAMILY_TOUCH_MIRROR_Y);
  return ok;
}

bool TouchController::poll(TouchFrame& frame) {
  if (digitalRead(kTouchIrqPin) != LOW) return false;
  uint8_t status = 0;
  if (gt910_read_reg(GTP_READ_COOR_ADDR, 1, &status) != SUCCESS) return false;
  if ((status & 0x80) == 0) return false;
  frame.count = status & 0x0F;
  if (frame.count > 5) frame.count = 0;
  uint8_t data[8 * 5] = {};
  if (frame.count &&
      gt910_read_reg(GTP_READ_COOR_ADDR + 1, frame.count * 8, data) != SUCCESS) {
    uint8_t clear = 0; gt910_write_reg(GTP_READ_COOR_ADDR, 1, &clear);
    return false;
  }
  for (uint8_t i = 0; i < frame.count; ++i) {
    const uint8_t offset = i * 8;
    const uint16_t rawX = data[offset + 1] | (static_cast<uint16_t>(data[offset + 2]) << 8);
    const uint16_t rawY = data[offset + 3] | (static_cast<uint16_t>(data[offset + 4]) << 8);
    frame.contacts[i].id = data[offset] & 0x0F;
    mapCoordinates(rawX, rawY, frame.contacts[i].x, frame.contacts[i].y);
    if (diagnosticsRemaining_ > 0) {
      Serial.printf("Beruehrungstest: ID=%u Rohwert=(%u,%u) Bildschirm=(%u,%u)\n",
                    frame.contacts[i].id, rawX, rawY, frame.contacts[i].x, frame.contacts[i].y);
      --diagnosticsRemaining_;
    }
  }
  uint8_t clear = 0;
  gt910_write_reg(GTP_READ_COOR_ADDR, 1, &clear);
  return true;
}

void TouchController::mapCoordinates(uint16_t rawX, uint16_t rawY, uint16_t& x, uint16_t& y) const {
#if FAMILY_TOUCH_SWAP_XY
  x = rawY; y = rawX;
#else
  x = rawX; y = rawY;
#endif
#if FAMILY_TOUCH_MIRROR_X
  x = x < kDisplayWidth ? kDisplayWidth - 1 - x : 0;
#endif
#if FAMILY_TOUCH_MIRROR_Y
  y = y < kDisplayHeight ? kDisplayHeight - 1 - y : 0;
#endif
  if (x >= kDisplayWidth) x = kDisplayWidth - 1;
  if (y >= kDisplayHeight) y = kDisplayHeight - 1;
}

}  // namespace family
