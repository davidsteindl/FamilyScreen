#include <unity.h>
#include <string.h>

#include "app_config.h"
#include "bitmap_canvas.h"
#include "family_types.h"
#include "touch_tracker.h"

using namespace family;

static uint8_t pixels[kFramebufferBytes];
static BitmapCanvas canvas(pixels);

void setUp() { canvas.clearWhite(); }
void tearDown() {}

void test_pixel_addressing_and_colour() {
  canvas.setPixel(0, 0, true);
  canvas.setPixel(799, 479, true);
  TEST_ASSERT_TRUE(canvas.isBlack(0, 0));
  TEST_ASSERT_TRUE(canvas.isBlack(799, 479));
  TEST_ASSERT_FALSE(canvas.isBlack(1, 0));
  canvas.setPixel(0, 0, false);
  TEST_ASSERT_FALSE(canvas.isBlack(0, 0));
}

void test_strokes_are_clipped_out_of_header() {
  DirtyBounds dirty;
  canvas.drawLine(10, 0, 10, 50, 2, true, &dirty);
  TEST_ASSERT_FALSE(canvas.isBlack(10, 20));
  TEST_ASSERT_TRUE(canvas.isBlack(10, 40));
  TEST_ASSERT_TRUE(canvas.isBlack(10, 50));
}

void test_dirty_rectangle_is_byte_aligned_and_clipped() {
  DirtyBounds dirty;
  dirty.include(13, 42, 2);
  dirty.include(799, 479, 4);
  const Rect rect = dirty.alignedRect();
  TEST_ASSERT_EQUAL_INT(8, rect.x);
  TEST_ASSERT_EQUAL_INT(40, rect.y);
  TEST_ASSERT_EQUAL_INT(792, rect.width);
  TEST_ASSERT_EQUAL_INT(440, rect.height);
}

void test_manifest_lookup_and_drawing_page() {
  PageManifest manifest{};
  manifest.count = 3;
  strcpy(manifest.pages[0].id, "home");
  strcpy(manifest.pages[1].id, "oma");
  manifest.pages[1].kind = PageKind::Drawing;
  strcpy(manifest.pages[2].id, "tobias");
  TEST_ASSERT_EQUAL_INT(2, manifest.find("tobias"));
  TEST_ASSERT_EQUAL_INT(-1, manifest.find("missing"));
  TEST_ASSERT_EQUAL_INT(1, manifest.drawingIndex());
}

void test_page_display_content_matching() {
  PageDescriptor current{};
  strcpy(current.id, "tobias");
  strcpy(current.label, "Tobias");
  strcpy(current.revision, "1");
  strcpy(current.sha256, "first-hash");

  PageDescriptor next = current;
  strcpy(next.revision, "2");
  TEST_ASSERT_TRUE(current.displayContentMatches(next));

  strcpy(next.sha256, "second-hash");
  TEST_ASSERT_FALSE(current.displayContentMatches(next));
  next = current;
  strcpy(next.label, "Tobi");
  TEST_ASSERT_FALSE(current.displayContentMatches(next));
  next = current;
  next.kind = PageKind::Drawing;
  TEST_ASSERT_FALSE(current.displayContentMatches(next));
}

void test_primary_touch_id_is_retained_and_secondary_is_ignored() {
  PrimaryTouchTracker tracker;
  TouchFrame frame{};
  frame.count = 1; frame.contacts[0].id = 3; frame.contacts[0].x = 10;
  TEST_ASSERT_EQUAL_INT(static_cast<int>(TouchEventType::Start), static_cast<int>(tracker.update(frame).type));
  frame.count = 2;
  frame.contacts[0].id = 7; frame.contacts[0].x = 700;
  frame.contacts[1].id = 3; frame.contacts[1].x = 20;
  TrackedTouchEvent move = tracker.update(frame);
  TEST_ASSERT_EQUAL_INT(static_cast<int>(TouchEventType::Move), static_cast<int>(move.type));
  TEST_ASSERT_EQUAL_UINT16(20, move.contact.x);
  frame.count = 1; frame.contacts[0].id = 7;
  TEST_ASSERT_EQUAL_INT(static_cast<int>(TouchEventType::End), static_cast<int>(tracker.update(frame).type));
  TEST_ASSERT_EQUAL_INT(static_cast<int>(TouchEventType::None), static_cast<int>(tracker.update(frame).type));
  frame.count = 0; tracker.update(frame);
  frame.count = 1;
  TEST_ASSERT_EQUAL_INT(static_cast<int>(TouchEventType::Start), static_cast<int>(tracker.update(frame).type));
}

int main(int, char**) {
  UNITY_BEGIN();
  RUN_TEST(test_pixel_addressing_and_colour);
  RUN_TEST(test_strokes_are_clipped_out_of_header);
  RUN_TEST(test_dirty_rectangle_is_byte_aligned_and_clipped);
  RUN_TEST(test_manifest_lookup_and_drawing_page);
  RUN_TEST(test_page_display_content_matching);
  RUN_TEST(test_primary_touch_id_is_retained_and_secondary_is_ignored);
  return UNITY_END();
}
