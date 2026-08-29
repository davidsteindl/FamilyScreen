#pragma once

#include <Arduino.h>
#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>
#include <freertos/semphr.h>
#include "family_types.h"

namespace family {

class EpdDisplay {
 public:
  bool begin(uint8_t* framebuffer, SemaphoreHandle_t framebufferMutex);
  bool requestFull();
  bool requestPartial(const Rect& rect);
  bool isIdle() const;

 private:
  enum class CommandType : uint8_t { Full, Partial };
  struct Command { CommandType type; Rect rect; };

  static void taskEntry(void* context);
  void taskLoop();
  bool execute(const Command& command);
  bool fullRefresh();
  bool partialRefresh(Rect rect);
  bool initializeController();
  bool waitReady(uint32_t timeoutMs);
  void hardwareReset();
  void writeCommand(uint8_t command);
  void writeData(uint8_t data);

  uint8_t* framebuffer_ = nullptr;
  SemaphoreHandle_t framebufferMutex_ = nullptr;
  QueueHandle_t queue_ = nullptr;
  TaskHandle_t task_ = nullptr;
  volatile bool busy_ = false;
  uint8_t partialCount_ = 0;
};

}  // namespace family
