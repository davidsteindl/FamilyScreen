#pragma once

#include "family_types.h"

namespace family {

enum class TouchEventType : uint8_t { None, Start, Move, End };
struct TrackedTouchEvent {
  TouchEventType type = TouchEventType::None;
  TouchContact contact;
};

class PrimaryTouchTracker {
 public:
  TrackedTouchEvent update(const TouchFrame& frame);
  void reset();
  void cancelUntilLift();
  bool active() const { return active_; }
 private:
  bool active_ = false;
  bool waitForLift_ = false;
  uint8_t id_ = 0;
};

}  // namespace family
