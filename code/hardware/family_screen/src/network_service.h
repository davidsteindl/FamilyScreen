#pragma once

#include <Arduino.h>
#include <HTTPClient.h>
#include <WiFiClient.h>
#include <WiFiClientSecure.h>
#include "cache_store.h"

namespace family {

class NetworkService {
 public:
  bool begin(CacheStore* cache);
  void requestSync();
  void requestUpload();
  uint32_t manifestGeneration() const { return manifestGeneration_; }
  bool connected() const;

 private:
  static void taskEntry(void* context);
  void taskLoop();
  bool configurationValid() const;
  void ensureWifi();
  bool ensureClock();
  bool synchronizeManifest();
  bool downloadPage(const PageDescriptor& page);
  bool uploadOneDrawing();
  bool beginRequest(HTTPClient& http, WiFiClient& plain, WiFiClientSecure& secure, const String& url);
  String metadataUrl() const;
  String pageBitmapUrl(const char* pageId) const;
  void addAuthorization(HTTPClient& http) const;

  CacheStore* cache_ = nullptr;
  TaskHandle_t task_ = nullptr;
  volatile uint32_t manifestGeneration_ = 0;
  bool wifiStarted_ = false;
  bool clockConfigured_ = false;
  uint32_t clockRetryAt_ = 0;
  PageManifest manifestScratch_;
  PageManifest nextManifestScratch_;
};

}  // namespace family
