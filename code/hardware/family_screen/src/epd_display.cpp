#include "epd_display.h"

#include <SPI.h>
#include "app_config.h"

namespace family {

namespace {
inline uint8_t displayByte(uint8_t framebufferByte) {
#if FAMILY_EPD_INVERT_TRANSFER_BITS
  return static_cast<uint8_t>(~framebufferByte);
#else
  return framebufferByte;
#endif
}
}

bool EpdDisplay::begin(uint8_t* framebuffer, SemaphoreHandle_t framebufferMutex) {
  framebuffer_ = framebuffer;
  framebufferMutex_ = framebufferMutex;
  pinMode(kEpdBusyPin, INPUT);
  pinMode(kEpdResetPin, OUTPUT);
  pinMode(kEpdDcPin, OUTPUT);
  pinMode(kEpdCsPin, OUTPUT);
  digitalWrite(kEpdCsPin, HIGH);
  SPI.begin();
  queue_ = xQueueCreate(6, sizeof(Command));
  if (!queue_) return false;
  return xTaskCreatePinnedToCore(taskEntry, "epd", 4096, this, 1, &task_, 1) == pdPASS;
}

bool EpdDisplay::requestFull() {
  const Command command{CommandType::Full, {0, 0, kDisplayWidth, kDisplayHeight}};
  return queue_ && xQueueSend(queue_, &command, 0) == pdTRUE;
}

bool EpdDisplay::requestPartial(const Rect& rect) {
  if (rect.empty()) return true;
  const Command command{CommandType::Partial, rect};
  return queue_ && xQueueSend(queue_, &command, 0) == pdTRUE;
}

bool EpdDisplay::isIdle() const {
  return queue_ && !busy_ && uxQueueMessagesWaiting(queue_) == 0;
}

void EpdDisplay::taskEntry(void* context) { static_cast<EpdDisplay*>(context)->taskLoop(); }

void EpdDisplay::taskLoop() {
  Command command{};
  for (;;) {
    if (xQueueReceive(queue_, &command, portMAX_DELAY) != pdTRUE) continue;
    busy_ = true;
    if (!execute(command)) Serial.println("EPD: refresh failed after recovery attempt");
    busy_ = false;
  }
}

bool EpdDisplay::execute(const Command& command) {
  for (uint8_t attempt = 0; attempt < 2; ++attempt) {
    bool ok;
    if (command.type == CommandType::Full || partialCount_ >= kPartialRefreshLimit) {
      ok = fullRefresh();
      if (ok) partialCount_ = 0;
    } else {
      ok = partialRefresh(command.rect);
      if (ok) ++partialCount_;
    }
    if (ok) return true;
    Serial.println("EPD: timeout, resetting controller");
    hardwareReset();
  }
  return false;
}

void EpdDisplay::hardwareReset() {
  digitalWrite(kEpdResetPin, LOW); delay(10);
  digitalWrite(kEpdResetPin, HIGH); delay(10);
}

bool EpdDisplay::initializeController() {
  hardwareReset();
  SPI.beginTransaction(SPISettings(10000000, MSBFIRST, SPI_MODE0));
  writeCommand(0x00); writeData(0x1F);
  writeCommand(0x50); writeData(0x10); writeData(0x07);
  writeCommand(0x04);
  SPI.endTransaction();
  if (!waitReady(6000)) return false;
  SPI.beginTransaction(SPISettings(10000000, MSBFIRST, SPI_MODE0));
  writeCommand(0x06); writeData(0x27); writeData(0x27); writeData(0x18); writeData(0x17);
  writeCommand(0xE0); writeData(0x02);
  writeCommand(0xE5); writeData(0x5A);
  SPI.endTransaction();
  return true;
}

bool EpdDisplay::fullRefresh() {
  if (!initializeController()) return false;
  SPI.beginTransaction(SPISettings(10000000, MSBFIRST, SPI_MODE0));
  writeCommand(0x10);
  for (size_t i = 0; i < kFramebufferBytes; ++i) writeData(displayByte(0xFF));
  writeCommand(0x13);
  if (xSemaphoreTake(framebufferMutex_, pdMS_TO_TICKS(250)) != pdTRUE) {
    SPI.endTransaction(); return false;
  }
  for (size_t i = 0; i < kFramebufferBytes; ++i) writeData(displayByte(framebuffer_[i]));
  xSemaphoreGive(framebufferMutex_);
  writeCommand(0x12);
  SPI.endTransaction();
  delay(1);
  return waitReady(15000);
}

bool EpdDisplay::partialRefresh(Rect rect) {
  if (rect.x < 0) { rect.width += rect.x; rect.x = 0; }
  if (rect.y < 0) { rect.height += rect.y; rect.y = 0; }
  if (rect.x + rect.width > kDisplayWidth) rect.width = kDisplayWidth - rect.x;
  if (rect.y + rect.height > kDisplayHeight) rect.height = kDisplayHeight - rect.y;
  rect.x &= ~7;
  rect.width = (rect.width + 7) & ~7;
  if (rect.x + rect.width > kDisplayWidth) rect.width = kDisplayWidth - rect.x;
  if (rect.empty()) return true;

  const uint16_t xEnd = rect.x + rect.width - 1;
  const uint16_t yEnd = rect.y + rect.height - 1;
  SPI.beginTransaction(SPISettings(10000000, MSBFIRST, SPI_MODE0));
  writeCommand(0x50); writeData(0xA9); writeData(0x07);
  writeCommand(0x91);
  writeCommand(0x90);
  writeData(rect.x >> 8); writeData(rect.x & 0xFF);
  writeData(xEnd >> 8); writeData(xEnd & 0xFF);
  writeData(rect.y >> 8); writeData(rect.y & 0xFF);
  writeData(yEnd >> 8); writeData(yEnd & 0xFF);
  writeData(0x01);
  writeCommand(0x13);
  if (xSemaphoreTake(framebufferMutex_, pdMS_TO_TICKS(250)) != pdTRUE) {
    SPI.endTransaction(); return false;
  }
  const size_t firstByte = rect.x / 8;
  const size_t rowBytes = rect.width / 8;
  for (int16_t y = rect.y; y < rect.y + rect.height; ++y) {
    const uint8_t* row = framebuffer_ + static_cast<size_t>(y) * kBytesPerRow + firstByte;
    // UC8179 partial mode uses the framebuffer polarity directly on this panel.
    // Sending displayByte() here turns the white dirty rectangle black and the
    // black stroke white, even though full-refresh transfers require inversion.
    for (size_t x = 0; x < rowBytes; ++x) writeData(row[x]);
  }
  xSemaphoreGive(framebufferMutex_);
  writeCommand(0x12);
  SPI.endTransaction();
  delay(1);
  const bool ok = waitReady(6000);
  SPI.beginTransaction(SPISettings(10000000, MSBFIRST, SPI_MODE0));
  writeCommand(0x92);
  SPI.endTransaction();
  return ok;
}

bool EpdDisplay::waitReady(uint32_t timeoutMs) {
  const uint32_t started = millis();
  while (digitalRead(kEpdBusyPin) == LOW) {
    if (millis() - started >= timeoutMs) return false;
    vTaskDelay(pdMS_TO_TICKS(2));
  }
  return true;
}

void EpdDisplay::writeCommand(uint8_t command) {
  digitalWrite(kEpdCsPin, LOW); digitalWrite(kEpdDcPin, LOW);
  SPI.transfer(command); digitalWrite(kEpdCsPin, HIGH);
}
void EpdDisplay::writeData(uint8_t data) {
  digitalWrite(kEpdCsPin, LOW); digitalWrite(kEpdDcPin, HIGH);
  SPI.transfer(data); digitalWrite(kEpdCsPin, HIGH);
}

}  // namespace family
