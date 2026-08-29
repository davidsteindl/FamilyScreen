#include "touch_tracker.h"

namespace family {

TrackedTouchEvent PrimaryTouchTracker::update(const TouchFrame& frame) {
  TrackedTouchEvent event{};
  if (waitForLift_) {
    if (frame.count == 0) waitForLift_ = false;
    return event;
  }
  if (!active_) {
    if (frame.count == 0) return event;
    active_ = true; id_ = frame.contacts[0].id;
    event.type = TouchEventType::Start; event.contact = frame.contacts[0]; return event;
  }
  for (uint8_t i = 0; i < frame.count; ++i) {
    if (frame.contacts[i].id == id_) {
      event.type = TouchEventType::Move; event.contact = frame.contacts[i]; return event;
    }
  }
  active_ = false; waitForLift_ = frame.count > 0; event.type = TouchEventType::End; return event;
}

void PrimaryTouchTracker::reset() { active_ = false; waitForLift_ = false; }
void PrimaryTouchTracker::cancelUntilLift() { active_ = false; waitForLift_ = true; }

}  // namespace family
