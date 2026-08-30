#include "cache_store.h"

#include <LittleFS.h>
#include <cJSON.h>
#include <mbedtls/sha256.h>
#include <new>
#include <string.h>
#include <sys/stat.h>
#include "app_config.h"

namespace family {
namespace {
constexpr const char* kManifestPath = "/manifest.json";
constexpr const char* kManifestTemporaryPath = "/manifest.tmp";

// FS::exists/open logs expected first-boot misses as errors. stat() lets normal
// optional-file checks stay quiet while using the same LittleFS mount point.
bool fileExists(const String& path) {
  const String mountedPath = String("/littlefs") + path;
  struct stat information {};
  return stat(mountedPath.c_str(), &information) == 0 && S_ISREG(information.st_mode);
}

String childPath(const char* directory, const String& name) {
  return name.startsWith("/") ? name : String(directory) + "/" + name;
}

void copyText(char* destination, size_t capacity, const char* source) {
  if (!destination || capacity == 0) return;
  if (!source) source = "";
  strncpy(destination, source, capacity - 1);
  destination[capacity - 1] = '\0';
}
}

bool CacheStore::begin() {
  mutex_ = xSemaphoreCreateMutex();
  if (!mutex_) return false;
  if (!LittleFS.begin(false)) {
    Serial.println("Speicher: LittleFS konnte nicht geoeffnet werden; einmaliger Formatierungsversuch");
    if (!LittleFS.begin(true)) return false;
  }
  LittleFS.mkdir("/pages");
  LittleFS.mkdir("/outbox");
  if (!preferences_.begin("family-screen", false)) return false;
  ready_ = true;
  recoverAtomicFiles();
  Serial.printf("Speicher: %u von %u Bytes belegt\n",
                static_cast<unsigned>(LittleFS.usedBytes()), static_cast<unsigned>(LittleFS.totalBytes()));
  return true;
}

bool CacheStore::validId(const char* id) {
  if (!id || !*id || strlen(id) > 64) return false;
  for (const char* p = id; *p; ++p) {
    if (!(isalnum(static_cast<unsigned char>(*p)) || *p == '-' || *p == '_')) return false;
  }
  return true;
}

bool CacheStore::validHash(const char* hash) {
  if (!hash || strlen(hash) != 64) return false;
  for (uint8_t i = 0; i < 64; ++i) if (!isdigit(hash[i]) && !(hash[i] >= 'a' && hash[i] <= 'f')) return false;
  return true;
}

String CacheStore::pagePath(const char* id) { return String("/pages/") + id + ".bin"; }

bool CacheStore::parseManifest(const String& json, const char* etag, PageManifest& manifest) const {
  cJSON* root = cJSON_ParseWithLength(json.c_str(), json.length());
  if (!root) return false;
  PageManifest* parsedPointer = new (std::nothrow) PageManifest();
  if (!parsedPointer) { cJSON_Delete(root); return false; }
  PageManifest& parsed = *parsedPointer;
  const cJSON* revision = cJSON_GetObjectItemCaseSensitive(root, "manifestRevision");
  const cJSON* pages = cJSON_GetObjectItemCaseSensitive(root, "pages");
  bool valid = cJSON_IsString(revision) && revision->valuestring &&
               cJSON_IsArray(pages) && cJSON_GetArraySize(pages) >= 1 &&
               cJSON_GetArraySize(pages) <= kMaximumPages;
  if (valid) {
    copyText(parsed.revision, sizeof(parsed.revision), revision->valuestring);
    copyText(parsed.etag, sizeof(parsed.etag), etag);
    parsed.count = static_cast<uint8_t>(cJSON_GetArraySize(pages));
    uint8_t drawingCount = 0;
    for (uint8_t i = 0; i < parsed.count && valid; ++i) {
      const cJSON* item = cJSON_GetArrayItem(pages, i);
      const cJSON* id = cJSON_GetObjectItemCaseSensitive(item, "id");
      const cJSON* label = cJSON_GetObjectItemCaseSensitive(item, "label");
      const cJSON* kind = cJSON_GetObjectItemCaseSensitive(item, "kind");
      const cJSON* pageRevision = cJSON_GetObjectItemCaseSensitive(item, "revision");
      const cJSON* sha = cJSON_GetObjectItemCaseSensitive(item, "sha256");
      valid = cJSON_IsString(id) && cJSON_IsString(label) && cJSON_IsString(kind) &&
              cJSON_IsString(pageRevision) && cJSON_IsString(sha) &&
              validId(id->valuestring) && validHash(sha->valuestring) &&
              strlen(label->valuestring) <= 64 && strlen(pageRevision->valuestring) <= 64;
      if (!valid) break;
      PageDescriptor& page = parsed.pages[i];
      copyText(page.id, sizeof(page.id), id->valuestring);
      copyText(page.label, sizeof(page.label), label->valuestring);
      copyText(page.revision, sizeof(page.revision), pageRevision->valuestring);
      copyText(page.sha256, sizeof(page.sha256), sha->valuestring);
      if (strcmp(kind->valuestring, "drawing") == 0) { page.kind = PageKind::Drawing; ++drawingCount; }
      else if (strcmp(kind->valuestring, "readonly") == 0) page.kind = PageKind::ReadOnly;
      else valid = false;
      for (uint8_t prior = 0; prior < i; ++prior) if (strcmp(parsed.pages[prior].id, page.id) == 0) valid = false;
    }
    // The device-owned drawing page is normally absent from the server manifest.
    // Accept zero or one server-declared drawing page, while reserving space for
    // the local page when it is absent.
    valid = valid && drawingCount <= 1 &&
            (drawingCount == 1 || parsed.count < kMaximumPages);
  }
  cJSON_Delete(root);
  if (valid) manifest = parsed;
  delete parsedPointer;
  return valid;
}

bool CacheStore::loadManifest(PageManifest& manifest) {
  if (!ready_) return false;
  if (xSemaphoreTake(mutex_, pdMS_TO_TICKS(1000)) != pdTRUE) return false;
  if (!fileExists(kManifestPath)) { xSemaphoreGive(mutex_); return false; }
  File file = LittleFS.open(kManifestPath, FILE_READ);
  if (!file) { xSemaphoreGive(mutex_); return false; }
  String json = file.readString(); file.close();
  xSemaphoreGive(mutex_);
  cJSON* root = cJSON_ParseWithLength(json.c_str(), json.length());
  if (!root) return false;
  const cJSON* etagNode = cJSON_GetObjectItemCaseSensitive(root, "_etag");
  const char* etag = cJSON_IsString(etagNode) ? etagNode->valuestring : "";
  const bool ok = parseManifest(json, etag, manifest);
  cJSON_Delete(root);
  return ok;
}

bool CacheStore::writeManifestFile(const PageManifest& manifest, const String& path) {
  cJSON* root = cJSON_CreateObject();
  cJSON_AddStringToObject(root, "manifestRevision", manifest.revision);
  cJSON_AddStringToObject(root, "_etag", manifest.etag);
  cJSON* pages = cJSON_AddArrayToObject(root, "pages");
  for (uint8_t i = 0; i < manifest.count; ++i) {
    const PageDescriptor& page = manifest.pages[i];
    cJSON* item = cJSON_CreateObject();
    cJSON_AddStringToObject(item, "id", page.id);
    cJSON_AddStringToObject(item, "label", page.label);
    cJSON_AddStringToObject(item, "kind", page.kind == PageKind::Drawing ? "drawing" : "readonly");
    cJSON_AddStringToObject(item, "revision", page.revision);
    cJSON_AddStringToObject(item, "sha256", page.sha256);
    cJSON_AddItemToArray(pages, item);
  }
  char* text = cJSON_PrintUnformatted(root);
  cJSON_Delete(root);
  if (!text) return false;
  File file = LittleFS.open(path, FILE_WRITE);
  const size_t length = strlen(text);
  const bool ok = file && file.write(reinterpret_cast<const uint8_t*>(text), length) == length;
  if (file) { file.flush(); file.close(); }
  cJSON_free(text);
  return ok;
}

bool CacheStore::replaceFile(const String& temporary, const String& target) {
  const String backup = target + ".bak";
  if (fileExists(backup)) LittleFS.remove(backup);
  const bool hadTarget = fileExists(target);
  if (hadTarget && !LittleFS.rename(target, backup)) return false;
  if (LittleFS.rename(temporary, target)) {
    if (fileExists(backup)) LittleFS.remove(backup);
    return true;
  }
  if (hadTarget) LittleFS.rename(backup, target);
  return false;
}

void CacheStore::recoverAtomicFiles() {
  const String manifestBackup = String(kManifestPath) + ".bak";
  if (!fileExists(kManifestPath) && fileExists(manifestBackup)) LittleFS.rename(manifestBackup, kManifestPath);
  else if (fileExists(manifestBackup)) LittleFS.remove(manifestBackup);
  if (fileExists(kManifestTemporaryPath)) LittleFS.remove(kManifestTemporaryPath);
  if (fileExists("/outbox/new.tmp")) LittleFS.remove("/outbox/new.tmp");
  File directory = LittleFS.open("/pages");
  if (!directory || !directory.isDirectory()) return;
  File file = directory.openNextFile();
  while (file) {
    const String name = childPath("/pages", file.name()); file.close();
    if (name.endsWith(".bak")) {
      const String target = name.substring(0, name.length() - 4);
      if (!fileExists(target)) LittleFS.rename(name, target); else LittleFS.remove(name);
    } else if (name.endsWith(".tmp")) LittleFS.remove(name);
    file = directory.openNextFile();
  }
  directory.close();
}

bool CacheStore::saveManifest(const PageManifest& manifest) {
  if (!ready_) return false;
  if (xSemaphoreTake(mutex_, pdMS_TO_TICKS(1000)) != pdTRUE) return false;
  if (fileExists(kManifestTemporaryPath)) LittleFS.remove(kManifestTemporaryPath);
  const bool written = writeManifestFile(manifest, kManifestTemporaryPath);
  const bool ok = written && replaceFile(kManifestTemporaryPath, kManifestPath);
  xSemaphoreGive(mutex_);
  return ok;
}

bool CacheStore::loadContent(const char* pageId, uint8_t* destination) {
  if (!ready_) return false;
  if (!validId(pageId) || !destination) return false;
  const String path = pagePath(pageId);
  if (!fileExists(path)) return false;
  File file = LittleFS.open(path, FILE_READ);
  if (!file || file.size() != kContentBytes) { if (file) file.close(); return false; }
  const size_t read = file.read(destination, kContentBytes); file.close();
  return read == kContentBytes;
}

void CacheStore::hashToHex(const uint8_t digest[32], char output[65]) {
  static constexpr char digits[] = "0123456789abcdef";
  for (uint8_t i = 0; i < 32; ++i) { output[2 * i] = digits[digest[i] >> 4]; output[2 * i + 1] = digits[digest[i] & 15]; }
  output[64] = '\0';
}

bool CacheStore::hashFile(const String& path, char hash[65]) {
  if (!fileExists(path)) return false;
  File file = LittleFS.open(path, FILE_READ); if (!file) return false;
  mbedtls_sha256_context context; mbedtls_sha256_init(&context); mbedtls_sha256_starts_ret(&context, 0);
  uint8_t buffer[512];
  while (file.available()) { const size_t count = file.read(buffer, sizeof(buffer)); mbedtls_sha256_update_ret(&context, buffer, count); }
  file.close(); uint8_t digest[32]; mbedtls_sha256_finish_ret(&context, digest); mbedtls_sha256_free(&context);
  hashToHex(digest, hash); return true;
}

bool CacheStore::storeContent(const char* pageId, HTTPClient& http, const char* expectedSha256) {
  if (!ready_) return false;
  if (!validId(pageId) || !validHash(expectedSha256)) return false;
  const size_t freeBytes = LittleFS.totalBytes() - LittleFS.usedBytes();
  if (freeBytes < kContentBytes + kStorageSafetyReserveBytes) {
    Serial.printf("Speicher: Seite %s wird nicht geladen; %u Bytes Reserve bleiben geschuetzt\n",
                  pageId, static_cast<unsigned>(kStorageSafetyReserveBytes));
    return false;
  }
  const String temporary = String("/pages/.") + pageId + ".tmp";
  if (fileExists(temporary)) LittleFS.remove(temporary);
  File file = LittleFS.open(temporary, FILE_WRITE); if (!file) return false;
  // Let HTTPClient consume the complete response according to its declared
  // framing. Its copier handles TCP availability and partial reads better than
  // fixed-size Stream::readBytes calls on a marginal Wi-Fi connection.
  const int received = http.writeToStream(&file);
  file.flush();
  file.close();
  char actual[65] = {};
  const bool valid = received == static_cast<int>(kContentBytes) &&
                     hashFile(temporary, actual) && strcmp(actual, expectedSha256) == 0;
  if (!valid) {
    Serial.printf("Speicher: Seite %s unvollstaendig oder Pruefsumme falsch (%d/%u Bytes)\n",
                  pageId, received, static_cast<unsigned>(kContentBytes));
    LittleFS.remove(temporary);
    return false;
  }
  if (xSemaphoreTake(mutex_, pdMS_TO_TICKS(1000)) != pdTRUE) { LittleFS.remove(temporary); return false; }
  const bool ok = replaceFile(temporary, pagePath(pageId)); xSemaphoreGive(mutex_); return ok;
}

bool CacheStore::contentMatches(const PageDescriptor& page) {
  if (!ready_) return false;
  const String path = pagePath(page.id);
  if (!fileExists(path)) return false;
  File file = LittleFS.open(path, FILE_READ); if (!file || file.size() != kContentBytes) { if (file) file.close(); return false; }
  file.close(); char actual[65]; return hashFile(path, actual) && strcmp(actual, page.sha256) == 0;
}

void CacheStore::cleanPagesNotIn(const PageManifest& manifest) {
  if (!ready_) return;
  File directory = LittleFS.open("/pages"); if (!directory || !directory.isDirectory()) return;
  File file = directory.openNextFile();
  while (file) {
    const String name = childPath("/pages", file.name()); file.close();
    if (name.endsWith(".bin")) {
      String id = name.substring(name.lastIndexOf('/') + 1, name.length() - 4);
      if (manifest.find(id.c_str()) < 0 && id != kLocalDrawingPageId) LittleFS.remove(name);
    }
    file = directory.openNextFile();
  }
  directory.close();
}

String CacheStore::selectedPageId() { return ready_ ? preferences_.getString("page", "") : String(); }
void CacheStore::saveSelectedPageId(const char* pageId) { if (ready_ && pageId) preferences_.putString("page", pageId); }

void CacheStore::discardDrawing(const char* pageId) {
  if (!ready_ || !validId(pageId)) return;
  if (xSemaphoreTake(mutex_, pdMS_TO_TICKS(1000)) != pdTRUE) return;
  const String drawingPath = pagePath(pageId);
  const String drawingTemporary = String("/pages/.") + pageId + ".draw.tmp";
  if (fileExists(drawingPath)) LittleFS.remove(drawingPath);
  if (fileExists(drawingTemporary)) LittleFS.remove(drawingTemporary);
  if (fileExists("/outbox/new.tmp")) LittleFS.remove("/outbox/new.tmp");
  File directory = LittleFS.open("/outbox");
  if (directory && directory.isDirectory()) {
    File file = directory.openNextFile();
    while (file) {
      const String name = childPath("/outbox", file.name()); file.close();
      if (name.endsWith(".bin")) LittleFS.remove(name);
      file = directory.openNextFile();
    }
    directory.close();
  }
  xSemaphoreGive(mutex_);
  Serial.println("Speicher: die vorherige Zeichnung wurde endgueltig entfernt");
}

bool CacheStore::snapshotDrawing(const char* pageId, const uint8_t* framebuffer, char outHash[65]) {
  if (!ready_) return false;
  if (!validId(pageId) || !framebuffer || !outHash) return false;
  const String pageTemporary = String("/pages/.") + pageId + ".draw.tmp";
  const String outTemporary = "/outbox/new.tmp";
  if (fileExists(pageTemporary)) LittleFS.remove(pageTemporary);
  if (fileExists(outTemporary)) LittleFS.remove(outTemporary);
  if (LittleFS.totalBytes() - LittleFS.usedBytes() < kContentBytes + 4096) {
    Serial.println("Speicher: fuer die Zeichnung ist gerade nicht genug Platz frei");
    return false;
  }

  // Commit the local page first, then create its upload copy. Writing both
  // 44 KB temporary files at once can exhaust LittleFS and leave the previous
  // drawing cached, which makes cleared ink return after page wraparound.
  File page = LittleFS.open(pageTemporary, FILE_WRITE);
  if (!page) return false;
  mbedtls_sha256_context context; mbedtls_sha256_init(&context); mbedtls_sha256_starts_ret(&context, 0);
  const uint8_t* content = framebuffer + kHeaderHeight * kBytesPerRow;
  bool ok = true;
  for (size_t offset = 0; offset < kContentBytes; offset += 512) {
    const size_t count = min(static_cast<size_t>(512), kContentBytes - offset);
    if (page.write(content + offset, count) != count) { ok = false; break; }
    mbedtls_sha256_update_ret(&context, content + offset, count);
  }
  page.flush(); page.close();
  uint8_t digest[32]; mbedtls_sha256_finish_ret(&context, digest); mbedtls_sha256_free(&context); hashToHex(digest, outHash);
  if (!ok) { LittleFS.remove(pageTemporary); return false; }

  if (xSemaphoreTake(mutex_, pdMS_TO_TICKS(1000)) != pdTRUE) {
    LittleFS.remove(pageTemporary); return false;
  }
  ok = replaceFile(pageTemporary, pagePath(pageId));
  xSemaphoreGive(mutex_);
  if (!ok) return false;

  const String outPath = String("/outbox/") + outHash + ".bin";
  if (!fileExists(outPath)) {
    File source = LittleFS.open(pagePath(pageId), FILE_READ);
    File out = LittleFS.open(outTemporary, FILE_WRITE);
    if (!source || !out) {
      if (source) source.close();
      if (out) out.close();
      LittleFS.remove(outTemporary);
      return false;
    }
    uint8_t buffer[512]; size_t total = 0;
    while (total < kContentBytes) {
      const size_t wanted = min(sizeof(buffer), kContentBytes - total);
      const size_t count = source.read(buffer, wanted);
      if (count == 0 || out.write(buffer, count) != count) { ok = false; break; }
      total += count;
    }
    source.close(); out.flush(); out.close();
    if (!ok || total != kContentBytes) { LittleFS.remove(outTemporary); return false; }
    if (xSemaphoreTake(mutex_, pdMS_TO_TICKS(1000)) != pdTRUE) {
      LittleFS.remove(outTemporary); return false;
    }
    if (fileExists(outPath)) LittleFS.remove(outTemporary);
    else ok = LittleFS.rename(outTemporary, outPath);
    xSemaphoreGive(mutex_);
    if (!ok) { LittleFS.remove(outTemporary); return false; }
  }

  File directory = LittleFS.open("/outbox"); File file = directory.openNextFile();
  while (file) { String name = childPath("/outbox", file.name()); file.close(); if (name.endsWith(".bin") && name != outPath) LittleFS.remove(name); file = directory.openNextFile(); }
  directory.close(); return true;
}

bool CacheStore::firstOutbox(String& path, char hash[65]) {
  if (!ready_) return false;
  File directory = LittleFS.open("/outbox"); if (!directory || !directory.isDirectory()) return false;
  File file = directory.openNextFile();
  while (file) {
    const String name = childPath("/outbox", file.name()); const size_t size = file.size(); file.close();
    if (name.endsWith(".bin") && size == kContentBytes) {
      const int slash = name.lastIndexOf('/'); const String stem = name.substring(slash + 1, name.length() - 4);
      if (validHash(stem.c_str())) { path = name; copyText(hash, 65, stem.c_str()); directory.close(); return true; }
    }
    file = directory.openNextFile();
  }
  directory.close(); return false;
}
bool CacheStore::hasOutbox() { String path; char hash[65]; return firstOutbox(path, hash); }
void CacheStore::removeOutbox(const String& path) {
  if (ready_ && path.startsWith("/outbox/") && path.endsWith(".bin") && fileExists(path))
    LittleFS.remove(path);
}

}  // namespace family
