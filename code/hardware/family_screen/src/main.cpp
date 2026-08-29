// Main Arduino application entrypoint. Kept as C++ to avoid sketch-preprocessor issues.
#include <Arduino.h>
#include <freertos/FreeRTOS.h>
#include <freertos/semphr.h>

#include "app_config.h"
#include "bitmap_canvas.h"
#include "cache_store.h"
#include "epd_display.h"
#include "family_types.h"
#include "network_service.h"
#include "secrets_config.h"
#include "touch_controller.h"
#include "touch_tracker.h"

using namespace family;

namespace {
uint8_t framebuffer[kFramebufferBytes];
SemaphoreHandle_t framebufferMutex = nullptr;
BitmapCanvas canvas(framebuffer);
CacheStore cache;
EpdDisplay display;
TouchController touch;
NetworkService network;
PageManifest manifest;
PageManifest manifestScratch;

class DebouncedButton {
 public:
  explicit DebouncedButton(uint8_t pin) : pin_(pin) {}
  void begin() { pinMode(pin_, INPUT_PULLUP); raw_ = stable_ = digitalRead(pin_); changedAt_ = millis(); }
  bool pressedEvent() {
    const bool value = digitalRead(pin_); const uint32_t now = millis();
    if (value != raw_) { raw_ = value; changedAt_ = now; }
    if (stable_ != raw_ && now - changedAt_ >= kButtonDebounceMs) {
      stable_ = raw_; return stable_ == LOW;
    }
    return false;
  }
 private:
  uint8_t pin_; bool raw_ = HIGH; bool stable_ = HIGH; uint32_t changedAt_ = 0;
};

DebouncedButton pageButton(kPageButtonPin);
DebouncedButton clearButton(kClearButtonPin);
uint8_t currentPage = 0;
uint32_t observedManifestGeneration = 0;
bool usingFallbackManifest = false;
bool pageTransition = false;
bool pendingPageAdvance = false;
bool pendingFullRefresh = false;
bool strokeActive = false;
PrimaryTouchTracker touchTracker;
uint16_t lastTouchX = 0, lastTouchY = 0;
DirtyBounds strokeBounds;
DirtyBounds pendingInkBounds;
bool drawingDirty = false;
uint32_t drawingChangedAt = 0;

bool isDrawingPage() {
  return manifest.count && currentPage < manifest.count && manifest.pages[currentPage].kind == PageKind::Drawing;
}

void makeFallbackManifest() {
  manifest = {}; strcpy(manifest.revision, "local-demo"); manifest.count = 4;
  strcpy(manifest.pages[0].id, "home"); strcpy(manifest.pages[0].label, "Home");
  manifest.pages[0].kind = PageKind::ReadOnly;
  strcpy(manifest.pages[1].id, "ottola"); strcpy(manifest.pages[1].label, "Ottola");
  manifest.pages[1].kind = PageKind::Drawing;
  strcpy(manifest.pages[2].id, "tobias"); strcpy(manifest.pages[2].label, "Tobias");
  manifest.pages[2].kind = PageKind::ReadOnly;
  strcpy(manifest.pages[3].id, "david"); strcpy(manifest.pages[3].label, "David");
  manifest.pages[3].kind = PageKind::ReadOnly;
  usingFallbackManifest = true;
}

void ensureLocalDrawingPageLast(PageManifest& pages) {
  PageDescriptor drawing{};
  const int existing = pages.drawingIndex();
  if (existing >= 0) {
    drawing = pages.pages[existing];
    for (uint8_t i = existing; i + 1 < pages.count; ++i) pages.pages[i] = pages.pages[i + 1];
    --pages.count;
  } else {
    strcpy(drawing.id, kLocalDrawingPageId);
    strcpy(drawing.label, kLocalDrawingPageLabel);
    drawing.kind = PageKind::Drawing;
  }
  if (pages.count < kMaximumPages) pages.pages[pages.count++] = drawing;
}

bool renderLocalDemoContent(const PageDescriptor& page) {
#if FAMILY_LOCAL_DEMO_MODE
  if (strcmp(page.id, "ottola") == 0) {
    canvas.clearContentWhite();
    return true;
  }
  if (strcmp(page.id, "home") == 0) {
    canvas.drawMessage("WELCOME HOME", "FAMILY SCREEN");
    DirtyBounds unused;
    canvas.drawLine(585, 205, 665, 145, 3, true, &unused);
    canvas.drawLine(665, 145, 745, 205, 3, true, &unused);
    canvas.drawLine(605, 190, 605, 300, 3, true, &unused);
    canvas.drawLine(725, 190, 725, 300, 3, true, &unused);
    canvas.drawLine(605, 300, 725, 300, 3, true, &unused);
    canvas.drawLine(650, 300, 650, 245, 2, true, &unused);
    canvas.drawLine(680, 245, 680, 300, 2, true, &unused);
    canvas.drawLine(650, 245, 680, 245, 2, true, &unused);
    canvas.fillCircle(720, 105, 18, true);
    return true;
  }
  if (strcmp(page.id, "tobias") == 0) {
    canvas.drawMessage("HELLO OTTOLA", "LOVE TOBIAS");
    return true;
  }
  if (strcmp(page.id, "david") == 0) {
    canvas.drawMessage("HELLO OTTOLA", "LOVE DAVID");
    return true;
  }
#else
  (void)page;
#endif
  return false;
}

void composeCurrentPage() {
  if (!manifest.count || currentPage >= manifest.count) return;
  const PageDescriptor& page = manifest.pages[currentPage];
  xSemaphoreTake(framebufferMutex, portMAX_DELAY);
  canvas.clearWhite();
  bool available = false;
#if FAMILY_LOCAL_DEMO_MODE
  if (page.kind == PageKind::Drawing)
    available = cache.loadContent(page.id, framebuffer + kHeaderHeight * kBytesPerRow);
  if (!available) available = renderLocalDemoContent(page);
#else
  available = cache.loadContent(page.id, framebuffer + kHeaderHeight * kBytesPerRow);
#endif
  if (!available && page.kind == PageKind::ReadOnly)
    canvas.drawMessage("PAGE UNAVAILABLE", "WAITING FOR SYNC");
  canvas.drawHeader(page.label);
  xSemaphoreGive(framebufferMutex);
  cache.saveSelectedPageId(page.id);
  strokeBounds.reset(); pendingInkBounds.reset(); strokeActive = false;
  touchTracker.reset(); pendingFullRefresh = false;
  pageTransition = display.requestFull();
  Serial.printf("Page: %s (%s), cached=%s\n", page.id,
                page.kind == PageKind::Drawing ? "drawing" : "readonly", available ? "yes" : "no");
}

void reloadManifestPreservingPage(bool displayFirstRealManifest) {
  manifestScratch = {}; if (!cache.loadManifest(manifestScratch)) return;
  ensureLocalDrawingPageLast(manifestScratch);
  char oldId[33] = {};
  if (manifest.count && currentPage < manifest.count) strcpy(oldId, manifest.pages[currentPage].id);
  manifest = manifestScratch;
  const int preserved = manifest.find(oldId);
  currentPage = preserved >= 0 ? static_cast<uint8_t>(preserved) : 0;
  const bool removed = oldId[0] && preserved < 0;
  usingFallbackManifest = false;
  if ((displayFirstRealManifest || removed) && display.isIdle()) composeCurrentPage();
}

void mergePendingInk(const Rect& rect) {
  if (rect.empty()) return;
  pendingInkBounds.include(rect.x, rect.y);
  pendingInkBounds.include(rect.x + rect.width - 1, rect.y + rect.height - 1);
}
void finishStroke() {
  if (!strokeActive) return;
  strokeActive = false; mergePendingInk(strokeBounds.alignedRect()); strokeBounds.reset();
}

void saveDrawingSnapshot() {
  if (!drawingDirty || !isDrawingPage()) return;
  finishStroke(); char hash[65] = {};
  xSemaphoreTake(framebufferMutex, portMAX_DELAY);
  const bool saved = cache.snapshotDrawing(manifest.pages[currentPage].id, framebuffer, hash);
  xSemaphoreGive(framebufferMutex);
  if (saved) { drawingDirty = false; network.requestUpload(); Serial.printf("Drawing: persisted %s\n", hash); }
  else Serial.println("Drawing: persist failed; will retry");
}

void advancePage() {
  if (!manifest.count) return;
  saveDrawingSnapshot(); currentPage = (currentPage + 1) % manifest.count;
  composeCurrentPage(); network.requestSync();
}

void addStrokeSegment(uint16_t x, uint16_t y) {
  xSemaphoreTake(framebufferMutex, portMAX_DELAY);
  canvas.drawLine(lastTouchX, lastTouchY, x, y, kBrushRadius, true, &strokeBounds);
  xSemaphoreGive(framebufferMutex);
  lastTouchX = x; lastTouchY = y; drawingDirty = true; drawingChangedAt = millis();
}
void processTouch(const TouchFrame& frame) {
  if (!isDrawingPage() || pageTransition) {
    if (!frame.count) { strokeActive = false; touchTracker.reset(); }
    return;
  }
  const TrackedTouchEvent event = touchTracker.update(frame);
  if (event.type == TouchEventType::Start) {
    if (event.contact.y < kHeaderHeight) { touchTracker.cancelUntilLift(); return; }
    strokeBounds.reset(); strokeActive = true;
    lastTouchX = event.contact.x; lastTouchY = event.contact.y;
    addStrokeSegment(event.contact.x, event.contact.y);
  } else if (event.type == TouchEventType::Move && strokeActive) {
    addStrokeSegment(event.contact.x, event.contact.y);
  } else if (event.type == TouchEventType::End) {
    finishStroke();
  }
}

void handleClear() {
  if (!isDrawingPage()) return;
  const bool hadActiveTouch = strokeActive || touchTracker.active();
  finishStroke();
  if (hadActiveTouch) touchTracker.cancelUntilLift(); else touchTracker.reset();
  xSemaphoreTake(framebufferMutex, portMAX_DELAY);
  canvas.clearContentWhite(); canvas.drawHeader(manifest.pages[currentPage].label);
  xSemaphoreGive(framebufferMutex);
  pendingInkBounds.reset(); drawingDirty = true; drawingChangedAt = millis();
  if (display.isIdle()) { pageTransition = display.requestFull(); pendingFullRefresh = false; }
  else pendingFullRefresh = true;
  Serial.println("Drawing: cleared");
}

void serviceDisplayQueue() {
  if (!display.isIdle()) return;
  if (pageTransition) pageTransition = false;
  if (pendingPageAdvance) { pendingPageAdvance = false; advancePage(); return; }
  if (pendingFullRefresh) { pendingFullRefresh = false; pageTransition = display.requestFull(); return; }
  if (!pendingInkBounds.empty()) {
    const Rect rect = pendingInkBounds.alignedRect();
    if (display.requestPartial(rect)) pendingInkBounds.reset();
  }
}
}  // namespace

void setup() {
  Serial.begin(115200); delay(100);
  Serial.printf("Family screen boot: heap=%u framebuffer=%u\n",
                static_cast<unsigned>(ESP.getFreeHeap()), static_cast<unsigned>(kFramebufferBytes));
  framebufferMutex = xSemaphoreCreateMutex();
  if (!framebufferMutex) { Serial.println("Fatal: framebuffer mutex failed"); return; }
  canvas.clearWhite(); pageButton.begin(); clearButton.begin(); touch.begin();
  const bool cacheReady = cache.begin();
#if FAMILY_LOCAL_DEMO_MODE
  makeFallbackManifest();
  Serial.println("Local demo mode: API requests are disabled");
#else
  if (!cacheReady || !cache.loadManifest(manifest)) makeFallbackManifest();
  else ensureLocalDrawingPageLast(manifest);
#endif
  const String selected = cacheReady ? cache.selectedPageId() : String();
  const int selectedIndex = manifest.find(selected.c_str());
  currentPage = selectedIndex >= 0 ? static_cast<uint8_t>(selectedIndex) : 0;
  if (!display.begin(framebuffer, framebufferMutex)) Serial.println("Fatal: display task failed");
  composeCurrentPage();
  if (cacheReady && network.begin(&cache)) {
    if (!FAMILY_LOCAL_DEMO_MODE) network.requestSync();
  }
  else if (!cacheReady) Serial.println("Network disabled because persistent cache is unavailable");
  else Serial.println("Fatal: network task failed");
  observedManifestGeneration = network.manifestGeneration();
}

void loop() {
  TouchFrame frame{}; if (touch.poll(frame)) processTouch(frame);
  if (clearButton.pressedEvent()) handleClear();
  if (pageButton.pressedEvent()) {
    const bool hadActiveTouch = strokeActive || touchTracker.active();
    finishStroke();
    if (hadActiveTouch) touchTracker.cancelUntilLift(); else touchTracker.reset();
    if (isDrawingPage()) saveDrawingSnapshot(); network.requestSync();
    if (display.isIdle() && !pageTransition) advancePage(); else pendingPageAdvance = true;
  }
  if (drawingDirty && !strokeActive && millis() - drawingChangedAt >= kDrawingIdleUploadMs) saveDrawingSnapshot();
  const uint32_t generation = network.manifestGeneration();
  if (generation != observedManifestGeneration && display.isIdle()) {
    const bool wasFallback = usingFallbackManifest; observedManifestGeneration = generation;
    reloadManifestPreservingPage(wasFallback);
  }
  serviceDisplayQueue(); delay(5);
}
