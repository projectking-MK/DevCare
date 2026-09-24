/**
 * Storage helpers for non-sensitive data only.
 * 
 * IMPORTANT:
 * As strictly dictated by GuardianLink Security Architecture:
 * - NO parent passwords, secrets, or auth tokens are ever stored here.
 * - This only holds non-sensitive client configuration (e.g. child device identifier).
 */

const CHILD_DEVICE_KEY = 'gl_child_device_info';

export interface SavedChildDeviceInfo {
  deviceId: string;
  deviceName: string;
  parentId: string;
  pairedAt: string;
}

export function saveChildDeviceInfo(info: SavedChildDeviceInfo): void {
  try {
    localStorage.setItem(CHILD_DEVICE_KEY, JSON.stringify(info));
  } catch {
    // Graceful fallback if storage unavailable
  }
}

export function getChildDeviceInfo(): SavedChildDeviceInfo | null {
  try {
    const raw = localStorage.getItem(CHILD_DEVICE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearChildDeviceInfo(): void {
  try {
    localStorage.removeItem(CHILD_DEVICE_KEY);
  } catch {
    // Ignore
  }
}
