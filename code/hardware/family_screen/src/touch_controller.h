#pragma once

#include "family_types.h"

namespace family {

class TouchController {
 public:
  bool begin();
  bool poll(TouchFrame& frame);

 private:
  void mapCoordinates(uint16_t rawX, uint16_t rawY, uint16_t& x, uint16_t& y) const;
  uint8_t diagnosticsRemaining_ = 20;
};

}  // namespace family
