#pragma once

#include <protocol_config.h>

namespace family {

// Keep enough LittleFS headroom for an atomic page replacement and the
// drawing upload copy. Read-only downloads stop before consuming this reserve.
constexpr size_t kStorageSafetyReserveBytes = 2 * kContentBytes + 16 * 1024;

constexpr uint32_t kProductionSyncIntervalMs = 10UL * 60UL * 1000UL;
constexpr uint32_t kDebugSyncIntervalMs = 15UL * 1000UL;
constexpr uint32_t kWifiConnectTimeoutMs = 20UL * 1000UL;
constexpr uint32_t kWifiRetryInitialMs = 5UL * 1000UL;
constexpr uint32_t kWifiRetryMaximumMs = 5UL * 60UL * 1000UL;
constexpr uint32_t kApiRetryInitialMs = 15UL * 1000UL;
constexpr uint32_t kApiRetryMaximumMs = 10UL * 60UL * 1000UL;
constexpr uint32_t kHttpConnectTimeoutMs = 8UL * 1000UL;
// A full 44 KB bitmap can take much longer than metadata on a marginal link.
constexpr uint32_t kHttpOperationTimeoutMs = 45UL * 1000UL;

#ifdef FAMILY_DEBUG_FAST_SYNC
constexpr uint32_t kSyncIntervalMs = kDebugSyncIntervalMs;
#else
constexpr uint32_t kSyncIntervalMs = kProductionSyncIntervalMs;
#endif

}  // namespace family
