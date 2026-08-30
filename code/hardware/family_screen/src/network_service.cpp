#include "network_service.h"

#include <LittleFS.h>
#include <WiFi.h>
#include <time.h>
#include "app_config.h"
#include "secrets_config.h"

namespace family {

bool NetworkService::begin(CacheStore* cache) {
  cache_ = cache;
  return xTaskCreatePinnedToCore(taskEntry, "network", 16384, this, 1, &task_, 0) == pdPASS;
}
void NetworkService::requestSync() { if (task_) xTaskNotifyGive(task_); }
void NetworkService::requestUpload() { if (task_) xTaskNotifyGive(task_); }
bool NetworkService::connected() const { return WiFi.status() == WL_CONNECTED; }
void NetworkService::taskEntry(void* context) { static_cast<NetworkService*>(context)->taskLoop(); }

bool NetworkService::configurationValid() const {
  if (FAMILY_LOCAL_DEMO_MODE) return false;
  if (!FAMILY_WIFI_SSID[0] || !FAMILY_API_BASE_URL[0]) return false;
  const String base(FAMILY_API_BASE_URL);
  if (base.startsWith("https://")) return FAMILY_API_CA_CERT[0] != '\0' || FAMILY_ALLOW_INSECURE_HTTPS;
  return FAMILY_ALLOW_INSECURE_HTTP && base.startsWith("http://");
}

bool NetworkService::ensureClock() {
  const String base(FAMILY_API_BASE_URL);
  if (!base.startsWith("https://") || FAMILY_ALLOW_INSECURE_HTTPS) return true;

  constexpr time_t kEarliestSaneTime = 1704067200;  // 2024-01-01 UTC
  if (time(nullptr) >= kEarliestSaneTime) return true;

  const uint32_t now = millis();
  if (clockRetryAt_ != 0 && static_cast<int32_t>(now - clockRetryAt_) < 0) return false;
  if (!clockConfigured_) {
    configTime(0, 0, "pool.ntp.org", "time.google.com", "time.cloudflare.com");
    clockConfigured_ = true;
  }

  Serial.println("Netzwerk: sichere Uhrzeit wird eingestellt");
  const uint32_t deadline = millis() + 10000;
  while (time(nullptr) < kEarliestSaneTime && static_cast<int32_t>(millis() - deadline) < 0) {
    vTaskDelay(pdMS_TO_TICKS(250));
  }
  if (time(nullptr) >= kEarliestSaneTime) {
    Serial.println("Netzwerk: sichere Verbindung ist vorbereitet");
    return true;
  }

  Serial.println("Netzwerk: Uhrzeit fehlt noch; die gespeicherten Seiten bleiben bereit");
  clockRetryAt_ = millis() + 30000;
  return false;
}

void NetworkService::ensureWifi() {
  if (WiFi.status() == WL_CONNECTED || !FAMILY_WIFI_SSID[0]) return;
  if (!wifiStarted_) {
    WiFi.mode(WIFI_STA);
    WiFi.setAutoReconnect(true);
    WiFi.persistent(false);
    WiFi.begin(FAMILY_WIFI_SSID, FAMILY_WIFI_PASSWORD);
    wifiStarted_ = true;
    Serial.println("Netzwerk: Verbindung mit dem WLAN wird hergestellt");
  }
}

String NetworkService::metadataUrl() const {
  String base(FAMILY_API_BASE_URL);
  while (base.endsWith("/")) base.remove(base.length() - 1);
  return base + "/device/metadata";
}

String NetworkService::pageBitmapUrl(const char* pageId) const {
  String base(FAMILY_API_BASE_URL);
  while (base.endsWith("/")) base.remove(base.length() - 1);
  return base + "/device/pages/" + pageId + "/bitmap";
}

bool NetworkService::beginRequest(HTTPClient& http, WiFiClient& plain,
                                  WiFiClientSecure& secure, const String& url) {
  http.setConnectTimeout(8000);
  http.setTimeout(15000);
  if (url.startsWith("https://")) {
    if (FAMILY_API_CA_CERT[0]) secure.setCACert(FAMILY_API_CA_CERT);
    else if (FAMILY_ALLOW_INSECURE_HTTPS) secure.setInsecure();
    else return false;
    return http.begin(secure, url);
  }
  if (FAMILY_ALLOW_INSECURE_HTTP && url.startsWith("http://")) return http.begin(plain, url);
  return false;
}

void NetworkService::addAuthorization(HTTPClient& http) const {
  if (FAMILY_API_BEARER_TOKEN[0]) http.addHeader("Authorization", String("Bearer ") + FAMILY_API_BEARER_TOKEN);
}

void NetworkService::taskLoop() {
  uint32_t lastSync = 0;
  uint32_t retryAt = 0;
  uint32_t retryDelay = 5000;
  if (FAMILY_LOCAL_DEMO_MODE) Serial.println("Netzwerk: lokaler Demomodus; WLAN ist moeglich, API-Anfragen bleiben ausgeschaltet");
  else if (!configurationValid()) Serial.println("Netzwerk: API ist nicht eingerichtet; der lokale Speicher bleibt verfuegbar");
  for (;;) {
    const bool requested = ulTaskNotifyTake(pdTRUE, pdMS_TO_TICKS(1000)) > 0;
    ensureWifi();
    if (!configurationValid() || WiFi.status() != WL_CONNECTED) continue;
    if (!ensureClock()) continue;
    const uint32_t now = millis();

    if (cache_->hasOutbox() && static_cast<int32_t>(now - retryAt) >= 0) {
      if (uploadOneDrawing()) { retryDelay = 5000; retryAt = 0; }
      else { retryAt = now + retryDelay; retryDelay = min<uint32_t>(retryDelay * 2, 10UL * 60UL * 1000UL); }
    }

    if (requested || lastSync == 0 || now - lastSync >= kSyncIntervalMs) {
      if (synchronizeManifest()) lastSync = now;
      else if (lastSync == 0) lastSync = now - kSyncIntervalMs + 30000;
    }
  }
}

bool NetworkService::synchronizeManifest() {
  manifestScratch_ = {};
  PageManifest& oldManifest = manifestScratch_;
  cache_->loadManifest(oldManifest);
  WiFiClient plain; WiFiClientSecure secure; HTTPClient http;
  const String url = metadataUrl();
  if (!beginRequest(http, plain, secure, url)) return false;
  const char* responseHeaders[] = {"ETag"};
  http.collectHeaders(responseHeaders, 1);
  addAuthorization(http);
  if (oldManifest.etag[0]) http.addHeader("If-None-Match", oldManifest.etag);
  const int status = http.GET();
  if (status == HTTP_CODE_NOT_MODIFIED) {
    http.end();
    for (uint8_t i = 0; i < oldManifest.count; ++i) {
      const PageDescriptor& page = oldManifest.pages[i];
      if (cache_->contentMatches(page)) continue;
      if (page.kind == PageKind::Drawing && cache_->hasOutbox()) continue;
      if (!downloadPage(page)) return false;
    }
    return true;
  }
  if (status != HTTP_CODE_OK) {
    Serial.printf("Netzwerk: Seitenliste meldet HTTP %d (%s)\n", status,
                  HTTPClient::errorToString(status).c_str());
    http.end(); return false;
  }
  const String body = http.getString();
  const String etag = http.header("ETag");
  http.end();
  nextManifestScratch_ = {};
  PageManifest& next = nextManifestScratch_;
  if (!cache_->parseManifest(body, etag.c_str(), next)) { Serial.println("Netzwerk: ungueltige Seitenliste empfangen"); return false; }

  // Removed pages must not occupy the reserve needed for Grandma's drawing.
  // The visible framebuffer remains intact while replacements download.
  cache_->cleanPagesNotIn(next);
  for (uint8_t i = 0; i < next.count; ++i) {
    const PageDescriptor& page = next.pages[i];
    if (cache_->contentMatches(page)) continue;
    if (page.kind == PageKind::Drawing && cache_->hasOutbox()) continue;
    if (!downloadPage(page)) return false;
  }
  if (!cache_->saveManifest(next)) return false;
  cache_->cleanPagesNotIn(next);
  ++manifestGeneration_;
  Serial.printf("Netzwerk: Seitenliste %s mit %u Seiten gespeichert\n", next.revision, next.count);
  return true;
}

bool NetworkService::downloadPage(const PageDescriptor& page) {
  WiFiClient plain; WiFiClientSecure secure; HTTPClient http;
  const String url = pageBitmapUrl(page.id);
  if (!beginRequest(http, plain, secure, url)) return false;
  addAuthorization(http);
  const int status = http.GET();
  if (status != HTTP_CODE_OK || http.getSize() != static_cast<int>(kContentBytes)) {
    Serial.printf("Netzwerk: Seite %s meldet HTTP=%d (%s), Laenge=%d\n", page.id, status,
                  HTTPClient::errorToString(status).c_str(), http.getSize());
    http.end(); return false;
  }
  WiFiClient* stream = http.getStreamPtr();
  const bool ok = stream && cache_->storeContent(page.id, *stream, page.sha256);
  http.end();
  if (!ok) Serial.printf("Netzwerk: Bilddaten fuer %s wurden abgelehnt\n", page.id);
  return ok;
}

bool NetworkService::uploadOneDrawing() {
  manifestScratch_ = {};
  PageManifest& manifest = manifestScratch_;
  if (!cache_->loadManifest(manifest)) return false;
  const int drawingIndex = manifest.drawingIndex();
  const char* drawingPageId = drawingIndex >= 0 ? manifest.pages[drawingIndex].id : kLocalDrawingPageId;
  String path; char hash[65];
  if (!cache_->firstOutbox(path, hash)) return true;
  File file = LittleFS.open(path, FILE_READ);
  if (!file || file.size() != kContentBytes) { if (file) file.close(); cache_->removeOutbox(path); return false; }

  WiFiClient plain; WiFiClientSecure secure; HTTPClient http;
  const String url = pageBitmapUrl(drawingPageId);
  if (!beginRequest(http, plain, secure, url)) { file.close(); return false; }
  addAuthorization(http);
  http.addHeader("Content-Type", "application/octet-stream");
  http.addHeader("X-Content-SHA256", hash);
  http.addHeader("Idempotency-Key", hash);
  const int status = http.sendRequest("PUT", &file, kContentBytes);
  file.close(); http.end();
  if (status < 200 || status >= 300) { Serial.printf("Netzwerk: Hochladen der Zeichnung meldet HTTP %d\n", status); return false; }
  cache_->removeOutbox(path);
  Serial.printf("Netzwerk: Zeichnung wurde hochgeladen (%s)\n", hash);
  requestSync();
  return true;
}

}  // namespace family
