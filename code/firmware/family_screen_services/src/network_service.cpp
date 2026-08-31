#include "network_service.h"

#include <LittleFS.h>
#include <StreamString.h>
#include <WiFi.h>
#include <string.h>
#include <time.h>
#include "service_config.h"
#include "secrets_config.h"

namespace family {
namespace {

bool deadlineReached(uint32_t now, uint32_t deadline) {
  return static_cast<int32_t>(now - deadline) >= 0;
}

const char* wifiStatusName(wl_status_t status) {
  switch (status) {
    case WL_IDLE_STATUS: return "wartet";
    case WL_NO_SSID_AVAIL: return "WLAN nicht gefunden";
    case WL_SCAN_COMPLETED: return "Suche abgeschlossen";
    case WL_CONNECTED: return "verbunden";
    case WL_CONNECT_FAILED: return "Anmeldung fehlgeschlagen";
    case WL_CONNECTION_LOST: return "Verbindung verloren";
    case WL_DISCONNECTED: return "getrennt";
    default: return "unbekannt";
  }
}

}  // namespace

bool NetworkService::begin(CacheStore* cache) {
  if (!cache) return false;
  cache_ = cache;
  wifiRetryDelayMs_ = kWifiRetryInitialMs;
  lastProgressMs_ = millis();
  return xTaskCreatePinnedToCore(taskEntry, "network", 16384, this, 1, &task_, 0) == pdPASS;
}
void NetworkService::requestSync() { if (task_) xTaskNotifyGive(task_); }
void NetworkService::requestUpload() { if (task_) xTaskNotifyGive(task_); }
bool NetworkService::connected() const { return WiFi.status() == WL_CONNECTED; }
void NetworkService::taskEntry(void* context) { static_cast<NetworkService*>(context)->taskLoop(); }

bool NetworkService::configurationValid() const {
  if (FAMILY_LOCAL_DEMO_MODE) return false;
  if (!FAMILY_WIFI_SSID[0] || !FAMILY_API_BASE_URL[0] || !FAMILY_API_BEARER_TOKEN[0]) return false;
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

void NetworkService::startWifiAttempt(uint32_t now) {
  if (wifiStarted_) {
    // Recreate the radio state instead of trusting a wedged DHCP or station
    // state forever. Credentials remain in RAM because persistence is off.
    WiFi.disconnect(false, false);
    WiFi.mode(WIFI_OFF);
    vTaskDelay(pdMS_TO_TICKS(100));
  }

  WiFi.persistent(false);
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.setAutoReconnect(true);
  WiFi.begin(FAMILY_WIFI_SSID, FAMILY_WIFI_PASSWORD);
  wifiStarted_ = true;
  wifiAttemptActive_ = true;
  wifiAttemptStartedAt_ = now;
  Serial.printf("Netzwerk: WLAN-Verbindungsversuch, naechste Wartezeit maximal %lu Sekunden\n",
                static_cast<unsigned long>(wifiRetryDelayMs_ / 1000));
}

bool NetworkService::ensureWifi(uint32_t now) {
  const wl_status_t status = WiFi.status();

  if (status == WL_CONNECTED) {
    if (!wifiWasConnected_) {
      const String address = WiFi.localIP().toString();
      Serial.printf("Netzwerk: WLAN verbunden, IP=%s, Signal=%d dBm\n",
                    address.c_str(), WiFi.RSSI());
      if (WiFi.RSSI() <= -80)
        Serial.println("Netzwerk: WARNUNG - WLAN-Signal ist sehr schwach; Geraet oder Zugangspunkt naeher platzieren");
    }
    wifiWasConnected_ = true;
    wifiAttemptActive_ = false;
    wifiRetryAt_ = 0;
    wifiRetryDelayMs_ = kWifiRetryInitialMs;
    return true;
  }

  if (wifiWasConnected_) {
    Serial.printf("Netzwerk: WLAN-Verbindung verloren (%s); Wiederverbindung beginnt\n",
                  wifiStatusName(status));
    wifiWasConnected_ = false;
    wifiAttemptActive_ = false;
    wifiRetryAt_ = now;
    clockRetryAt_ = 0;
  }

  if (wifiAttemptActive_) {
    if (now - wifiAttemptStartedAt_ < kWifiConnectTimeoutMs) return false;
    Serial.printf("Netzwerk: WLAN nach %lu Sekunden nicht verbunden (%s)\n",
                  static_cast<unsigned long>(kWifiConnectTimeoutMs / 1000),
                  wifiStatusName(status));
    wifiAttemptActive_ = false;
    WiFi.disconnect(false, false);
    wifiRetryAt_ = now + wifiRetryDelayMs_;
    wifiRetryDelayMs_ = min<uint32_t>(wifiRetryDelayMs_ * 2, kWifiRetryMaximumMs);
    return false;
  }

  if (!wifiStarted_ || deadlineReached(now, wifiRetryAt_)) {
    startWifiAttempt(now);
  }
  return false;
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
  http.setConnectTimeout(kHttpConnectTimeoutMs);
  http.setTimeout(kHttpOperationTimeoutMs);
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
  uint32_t nextSyncAt = 0;
  uint32_t syncRetryDelay = kApiRetryInitialMs;
  uint32_t uploadRetryAt = 0;
  uint32_t uploadRetryDelay = kWifiRetryInitialMs;
  bool syncRequested = true;
  if (FAMILY_LOCAL_DEMO_MODE) Serial.println("Netzwerk: lokaler Demomodus; WLAN ist moeglich, API-Anfragen bleiben ausgeschaltet");
  else if (!configurationValid()) Serial.println("Netzwerk: API ist nicht eingerichtet; der lokale Speicher bleibt verfuegbar");
  for (;;) {
    markProgress();
    if (ulTaskNotifyTake(pdTRUE, pdMS_TO_TICKS(1000)) > 0) syncRequested = true;
    if (!configurationValid()) continue;

    uint32_t now = millis();
    if (!ensureWifi(now)) { markProgress(); continue; }
    if (!ensureClock()) { markProgress(); continue; }
    markProgress();
    now = millis();

    if (cache_->hasOutbox() && deadlineReached(now, uploadRetryAt)) {
      if (uploadOneDrawing()) {
        uploadRetryDelay = kWifiRetryInitialMs;
        uploadRetryAt = 0;
      } else {
        uploadRetryAt = millis() + uploadRetryDelay;
        Serial.printf("Netzwerk: Zeichnung wird in %lu Sekunden erneut versucht\n",
                      static_cast<unsigned long>(uploadRetryDelay / 1000));
        uploadRetryDelay = min<uint32_t>(uploadRetryDelay * 2, kApiRetryMaximumMs);
      }
      markProgress();
    }

    now = millis();
    if (syncRequested || deadlineReached(now, nextSyncAt)) {
      const bool synchronized = synchronizeManifest();
      markProgress();
      now = millis();
      syncRequested = false;
      if (synchronized) {
        nextSyncAt = now + kSyncIntervalMs;
        syncRetryDelay = kApiRetryInitialMs;
      } else {
        nextSyncAt = now + syncRetryDelay;
        Serial.printf("Netzwerk: Seitenabgleich wird in %lu Sekunden erneut versucht\n",
                      static_cast<unsigned long>(syncRetryDelay / 1000));
        syncRetryDelay = min<uint32_t>(syncRetryDelay * 2, kApiRetryMaximumMs);
      }
    }
  }
}

bool NetworkService::synchronizeManifest() {
  memset(&manifestScratch_, 0, sizeof(manifestScratch_));
  PageManifest& oldManifest = manifestScratch_;
  cache_->loadManifest(oldManifest);
  bool notModified = false;
  String body;
  String etag;
  {
    // Destroy the metadata TLS client before opening a second TLS connection
    // for a bitmap. Keeping both clients alive can fragment the ESP32 heap and
    // make an otherwise valid certificate check fail during page downloads.
    WiFiClient plain; WiFiClientSecure secure; HTTPClient http;
    const String url = metadataUrl();
    if (!beginRequest(http, plain, secure, url)) return false;
    const char* responseHeaders[] = {"ETag"};
    http.collectHeaders(responseHeaders, 1);
    addAuthorization(http);
    if (oldManifest.etag[0]) http.addHeader("If-None-Match", oldManifest.etag);
    const int status = http.GET();
    markProgress();
    if (status == HTTP_CODE_NOT_MODIFIED) {
      notModified = true;
    } else if (status == HTTP_CODE_OK) {
      etag = http.header("ETag");
      // Arduino-ESP32 2.x getString() fails for chunked bodies whose reported
      // size is -1 because it tries to reserve zero bytes. Vercel legitimately
      // sends metadata that way, so use HTTPClient's chunk-aware stream copier.
      StreamString response;
      if (!response.reserve(12 * 1024)) {
        Serial.println("Netzwerk: kein Speicher fuer die Seitenliste");
        http.end();
        return false;
      }
      const int received = http.writeToStream(&response);
      if (received < 0) {
        Serial.printf("Netzwerk: Seitenliste konnte nicht gelesen werden (%s)\n",
                      HTTPClient::errorToString(received).c_str());
        http.end();
        return false;
      }
      body = response;
    } else {
      Serial.printf("Netzwerk: Seitenliste meldet HTTP %d (%s)\n", status,
                    HTTPClient::errorToString(status).c_str());
      http.end();
      return false;
    }
    http.end();
  }

  if (notModified) {
    for (uint8_t i = 0; i < oldManifest.count; ++i) {
      const PageDescriptor& page = oldManifest.pages[i];
      if (cache_->contentMatches(page)) continue;
      if (page.kind == PageKind::Drawing && cache_->hasOutbox()) continue;
      if (!downloadPage(page)) return false;
      markProgress();
    }
    Serial.println("Netzwerk: Seiten sind unveraendert");
    return true;
  }
  markProgress();
  memset(&nextManifestScratch_, 0, sizeof(nextManifestScratch_));
  PageManifest& next = nextManifestScratch_;
  if (!cache_->parseManifest(body, etag.c_str(), next)) {
    Serial.printf("Netzwerk: ungueltige oder unvollstaendige Seitenliste (%u Bytes)\n",
                  static_cast<unsigned>(body.length()));
    return false;
  }

  // Removed pages must not occupy the reserve needed for Grandma's drawing.
  // The visible framebuffer remains intact while replacements download.
  cache_->cleanPagesNotIn(next);
  for (uint8_t i = 0; i < next.count; ++i) {
    const PageDescriptor& page = next.pages[i];
    if (cache_->contentMatches(page)) continue;
    if (page.kind == PageKind::Drawing && cache_->hasOutbox()) continue;
    if (!downloadPage(page)) return false;
    markProgress();
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
  // Bind this download to the exact representation advertised by metadata.
  // If content changes in the small gap between both requests, the server
  // returns 412 and the next manifest sync retries with the new hash.
  http.addHeader("If-Match", String("\"") + page.sha256 + "\"");
  const int status = http.GET();
  markProgress();
  if (status != HTTP_CODE_OK || http.getSize() != static_cast<int>(kContentBytes)) {
    Serial.printf("Netzwerk: Seite %s meldet HTTP=%d (%s), Laenge=%d\n", page.id, status,
                  HTTPClient::errorToString(status).c_str(), http.getSize());
    http.end(); return false;
  }
  const bool ok = cache_->storeContent(page.id, http, page.sha256);
  http.end();
  markProgress();
  if (!ok) Serial.printf("Netzwerk: Bilddaten fuer %s wurden abgelehnt\n", page.id);
  return ok;
}

bool NetworkService::uploadOneDrawing() {
  memset(&manifestScratch_, 0, sizeof(manifestScratch_));
  PageManifest& manifest = manifestScratch_;
  cache_->loadManifest(manifest);
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
  markProgress();
  file.close(); http.end();
  if (status < 200 || status >= 300) { Serial.printf("Netzwerk: Hochladen der Zeichnung meldet HTTP %d\n", status); return false; }
  cache_->removeOutbox(path);
  Serial.printf("Netzwerk: Zeichnung wurde hochgeladen (%s)\n", hash);
  requestSync();
  return true;
}

}  // namespace family
