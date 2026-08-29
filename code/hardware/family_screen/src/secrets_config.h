#pragma once

#if __has_include("secrets.h")
#include "secrets.h"
#else
#define FAMILY_WIFI_SSID ""
#define FAMILY_WIFI_PASSWORD ""
#define FAMILY_DEVICE_ID "unconfigured-device"
#define FAMILY_API_BASE_URL ""
#define FAMILY_API_BEARER_TOKEN ""
#define FAMILY_API_CA_CERT ""
#define FAMILY_ALLOW_INSECURE_HTTP 0
#define FAMILY_LOCAL_DEMO_MODE 1
#endif

#ifndef FAMILY_LOCAL_DEMO_MODE
#define FAMILY_LOCAL_DEMO_MODE 0
#endif
