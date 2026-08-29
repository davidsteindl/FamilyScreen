#pragma once

// Copy this file to include/secrets.h. That file is ignored by Git.
#define FAMILY_WIFI_SSID "your-wifi"
#define FAMILY_WIFI_PASSWORD "your-password"
#define FAMILY_DEVICE_ID "ottola-screen-1"
#define FAMILY_API_BASE_URL ""
#define FAMILY_API_BEARER_TOKEN ""
#define FAMILY_API_CA_CERT R"CERT(
-----BEGIN CERTIFICATE-----
replace-with-ca-certificate-when-using-https
-----END CERTIFICATE-----
)CERT"
#define FAMILY_ALLOW_INSECURE_HTTP 1

// Keep this enabled until the real API is ready. The device uses four local pages
// and does not make API requests. Change to 0 when connecting the backend.
#define FAMILY_LOCAL_DEMO_MODE 1
