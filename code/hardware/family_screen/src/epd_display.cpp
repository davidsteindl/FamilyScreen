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
    if (!execute(command)) Serial.println("EPD: Aktualisierung ist auch nach dem Wiederherstellungsversuch fehlgeschlagen");
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
    Serial.println("EPD: Zeitueberschreitung, Controller wird neu gestartet");
    hardwareReset();
  }
  return false;
}

void EpdDisplay::hardwareReset() {
  waveform_ = Waveform::Unknown;
  digitalWrite(kEpdResetPin, LOW); delay(10);
  digitalWrite(kEpdResetPin, HIGH); delay(10);
}

void EpdDisplay::setResolution() {
  writeCommand(0x61);
  writeData(kDisplayWidth >> 8); writeData(kDisplayWidth & 0xFF);
  writeData(kDisplayHeight >> 8); writeData(kDisplayHeight & 0xFF);
}

bool EpdDisplay::initializeFullController() {
  hardwareReset();
  SPI.beginTransaction(SPISettings(10000000, MSBFIRST, SPI_MODE0));
  writeCommand(0x01); writeData(0x07); writeData(0x07); writeData(0x3F); writeData(0x3F);
  writeCommand(0x06); writeData(0x17); writeData(0x17); writeData(0x28); writeData(0x17);
  writeCommand(0x04);
  SPI.endTransaction();
  if (!waitReady(6000)) return false;
  SPI.beginTransaction(SPISettings(10000000, MSBFIRST, SPI_MODE0));
  writeCommand(0x00); writeData(0x1F);
  setResolution();
  writeCommand(0x15); writeData(0x00);
  // DDX=01 keeps 1=white; N2OCP copies new RAM to old RAM after refresh.
  writeCommand(0x50); writeData(0x29); writeData(0x07);
  writeCommand(0x60); writeData(0x22);
  SPI.endTransaction();
  waveform_ = Waveform::Full;
  return true;
}

bool EpdDisplay::initializePartialController() {
  if (waveform_ == Waveform::Partial) return true;
  // Waveform changes require a reset. UC8179 image RAM survives the reset.
  hardwareReset();
  SPI.beginTransaction(SPISettings(10000000, MSBFIRST, SPI_MODE0));
  writeCommand(0x00); writeData(0x1F);
  setResolution();
  writeCommand(0x04);
  SPI.endTransaction();
  if (!waitReady(6000)) return false;
  SPI.beginTransaction(SPISettings(10000000, MSBFIRST, SPI_MODE0));
  writeCommand(0xE0); writeData(0x02);
  writeCommand(0xE5); writeData(0x6E);
  SPI.endTransaction();
  waveform_ = Waveform::Partial;
  return true;
}

bool EpdDisplay::fullRefresh() {
  if (!initializeFullController()) return false;
  SPI.beginTransaction(SPISettings(10000000, MSBFIRST, SPI_MODE0));
  if (xSemaphoreTake(framebufferMutex_, pdMS_TO_TICKS(250)) != pdTRUE) {
    SPI.endTransaction(); return false;
  }
  // Seed the old-image plane only once after power-up. Afterwards N2OCP keeps
  // it synchronized with what is actually on the glass. Overwriting it with
  // white on every refresh makes black ink reappear during a clear operation.
  if (!oldPlaneReady_) {
    writeCommand(0x10);
    for (size_t i = 0; i < kFramebufferBytes; ++i)
      writeData(displayByte(static_cast<uint8_t>(~framebuffer_[i])));
  }
  writeCommand(0x13);
  for (size_t i = 0; i < kFramebufferBytes; ++i) writeData(displayByte(framebuffer_[i]));
  xSemaphoreGive(framebufferMutex_);
  writeCommand(0x12);
  SPI.endTransaction();
  delay(1);
  const bool ok = waitReady(15000);
  if (ok) oldPlaneReady_ = true;
  return ok;
}

bool EpdDisplay::partialRefresh(Rect rect) {
  if (!initializePartialController()) return false;
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
    // Full and partial controller modes now share the same 1=white polarity.
    for (size_t x = 0; x < rowBytes; ++x) writeData(row[x]);
  }
  xSemaphoreGive(framebufferMutex_);
  // The window limits the RAM write. Refresh itself is a differential scan;
  // exiting the window first avoids driving the whole rectangle as a block.
  writeCommand(0x92);
  writeCommand(0x50); writeData(0xA9); writeData(0x07);
  writeCommand(0x12);
  SPI.endTransaction();
  delay(10);
  return waitReady(6000);
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
