#pragma once

// Copy this file to secrets.h in this directory. That file is ignored by Git.
#define FAMILY_WIFI_SSID "your-wifi"
#define FAMILY_WIFI_PASSWORD "your-password"
#define FAMILY_DEVICE_ID "ottola-screen-1"
#define FAMILY_API_BASE_URL ""
#define FAMILY_API_BEARER_TOKEN ""
#define FAMILY_API_CA_CERT FAMILY_LETS_ENCRYPT_ISRG_ROOT_X1_CERT
#define FAMILY_ALLOW_INSECURE_HTTP 0
// Emergency development escape hatch only. Keep this at 0.
#define FAMILY_ALLOW_INSECURE_HTTPS 0

// Useful for a device without a page-switch button. When enabled, boot and the
// first successful manifest sync select the local drawing/message page.
#define FAMILY_START_ON_DRAWING_PAGE 0

// Keep this enabled until the real API is ready. The device uses four local pages
// and does not make API requests. Change to 0 when connecting the backend.
#define FAMILY_LOCAL_DEMO_MODE 1
