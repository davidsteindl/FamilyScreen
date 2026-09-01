#pragma once

// Secret selection and TLS policy shared by the reusable network service.

#include "api_ca_cert.h"

#if __has_include("secrets.h")
#include "secrets.h"
#else
#define FAMILY_WIFI_SSID ""
#define FAMILY_WIFI_PASSWORD ""
#define FAMILY_DEVICE_ID "unconfigured-device"
#define FAMILY_API_BASE_URL ""
#define FAMILY_API_BEARER_TOKEN ""
#define FAMILY_API_CA_CERT FAMILY_LETS_ENCRYPT_ISRG_ROOT_X1_CERT
#define FAMILY_ALLOW_INSECURE_HTTP 0
#define FAMILY_LOCAL_DEMO_MODE 1
#endif

#ifndef FAMILY_LOCAL_DEMO_MODE
#define FAMILY_LOCAL_DEMO_MODE 0
#endif

#ifndef FAMILY_ALLOW_INSECURE_HTTP
#define FAMILY_ALLOW_INSECURE_HTTP 0
#endif

#ifndef FAMILY_ALLOW_INSECURE_HTTPS
#define FAMILY_ALLOW_INSECURE_HTTPS 0
#endif

#ifndef FAMILY_START_ON_DRAWING_PAGE
#define FAMILY_START_ON_DRAWING_PAGE 0
#endif

#ifndef FAMILY_API_CA_CERT
#define FAMILY_API_CA_CERT FAMILY_LETS_ENCRYPT_ISRG_ROOT_X1_CERT
#endif
