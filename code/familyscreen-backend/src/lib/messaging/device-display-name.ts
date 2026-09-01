const LEGACY_DEVICE_PREFIX = "fs_FamilyScreen ";

/**
 * Legacy devices were named after their owner, and the UI historically showed
 * that owner name. Preserve that exact presentation while letting explicitly
 * named devices identify themselves instead of impersonating their owner.
 */
export function deviceDisplayName(deviceName: string, ownerName: string) {
  return deviceName.startsWith(LEGACY_DEVICE_PREFIX) ? ownerName : deviceName;
}
