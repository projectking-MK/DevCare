/**
 * Storage helpers for non-sensitive child companion configuration.
 * 
 * IMPORTANT:
 * - NO parent passwords or credentials are stored here.
 * - Stores non-sensitive child device identity to guarantee one-time pairing
 *   and automatic login when opening the webpage.
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
    const serialized = JSON.stringify(info);
    // 1. Primary storage in localStorage
    localStorage.setItem(CHILD_DEVICE_KEY, serialized);

    // 2. Redundant persistent cookie (1 year lifespan) to protect against localStorage clearance
    const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toUTCString();
    document.cookie = `gl_child_device=${encodeURIComponent(serialized)}; expires=${expires}; path=/; SameSite=Lax`;
  } catch {
    // Graceful fallback if storage unavailable
  }
}

export function getChildDeviceInfo(): SavedChildDeviceInfo | null {
  try {
    // 1. Check primary localStorage
    const raw = localStorage.getItem(CHILD_DEVICE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }

    // 2. Check redundant cookie fallback
    const match = document.cookie.match(/(?:^|;\s*)gl_child_device=([^;]+)/);
    if (match && match[1]) {
      const decoded = decodeURIComponent(match[1]);
      const parsed = JSON.parse(decoded);
      // Restore to localStorage for instant access
      try {
        localStorage.setItem(CHILD_DEVICE_KEY, decoded);
      } catch {
        // Ignore
      }
      return parsed;
    }

    return null;
  } catch {
    return null;
  }
}

export function isChildDevicePaired(): boolean {
  return Boolean(getChildDeviceInfo()?.deviceId);
}

export function clearChildDeviceInfo(): void {
  try {
    localStorage.removeItem(CHILD_DEVICE_KEY);
    document.cookie = 'gl_child_device=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax';
  } catch {
    // Ignore
  }
}
