#pragma once

#include <Arduino.h>
#include <FS.h>
#include <Preferences.h>
#include <freertos/semphr.h>
#include "family_types.h"

namespace family {

class CacheStore {
 public:
  bool begin();
  bool loadManifest(PageManifest& manifest);
  bool parseManifest(const String& json, const char* etag, PageManifest& manifest) const;
  bool saveManifest(const PageManifest& manifest);
  bool loadContent(const char* pageId, uint8_t* destination);
  bool storeContent(const char* pageId, Stream& stream, const char* expectedSha256);
  bool contentMatches(const PageDescriptor& page);
  void cleanPagesNotIn(const PageManifest& manifest);

  String selectedPageId();
  void saveSelectedPageId(const char* pageId);

  void discardDrawing(const char* pageId);
  bool snapshotDrawing(const char* pageId, const uint8_t* framebuffer, char outHash[65]);
  bool firstOutbox(String& path, char hash[65]);
  bool hasOutbox();
  void removeOutbox(const String& path);

 private:
  static bool validId(const char* id);
  static bool validHash(const char* hash);
  static String pagePath(const char* id);
  static bool hashFile(const String& path, char hash[65]);
  static void hashToHex(const uint8_t digest[32], char output[65]);
  bool replaceFile(const String& temporary, const String& target);
  bool writeManifestFile(const PageManifest& manifest, const String& path);
  void recoverAtomicFiles();

  Preferences preferences_;
  SemaphoreHandle_t mutex_ = nullptr;
  bool ready_ = false;
};

}  // namespace family
