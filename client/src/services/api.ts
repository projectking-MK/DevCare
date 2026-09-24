/**
 * GuardianLink API Service
 * Handles HTTP requests to the backend with credential cookies included.
 */

// In development, Vite proxies /api to backend. In production, same-origin is used.
const API_BASE = '/api';

export class ApiError extends Error {
  constructor(public message: string, public status?: number, public code?: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const config: RequestInit = {
    ...options,
    credentials: 'include', // Automatically sends HttpOnly authentication cookies
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  };

  try {
    const response = await fetch(url, config);
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new ApiError(
        data.error || `Request failed with status ${response.status}`,
        response.status,
        data.code
      );
    }

    return data as T;
  } catch (err) {
    if (err instanceof ApiError) {
      throw err;
    }
    throw new ApiError(err instanceof Error ? err.message : 'Network error occurred. Please check your connection.');
  }
}

// Authentication endpoints
export const authApi = {
  login: (credentials: { email: string; password: string }) =>
    request<{ success: boolean; user: { parentId: string; email: string } }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    }),

  getMe: () =>
    request<{ authenticated: boolean; user?: { parentId: string; email: string; expiresAt: string } }>('/auth/me', {
      method: 'GET',
    }),

  logout: () =>
    request<{ success: boolean; message: string }>('/auth/logout', {
      method: 'POST',
    }),
};

// Pairing endpoints
export const pairingApi = {
  generateCode: () =>
    request<{ success: boolean; code: string; expiresAt: string }>('/pairing/generate', {
      method: 'POST',
    }),

  getActiveCode: () =>
    request<{ hasActiveCode: boolean; code?: string; expiresAt?: string }>('/pairing/active', {
      method: 'GET',
    }),

  verifyCode: (code: string, deviceName?: string) =>
    request<{ success: boolean; device: { deviceId: string; deviceName: string; parentId: string; pairedAt: string } }>(
      '/pairing/verify',
      {
        method: 'POST',
        body: JSON.stringify({ code, deviceName }),
      }
    ),

  getDevices: () =>
    request<{ success: boolean; devices: Array<{ deviceId: string; deviceName: string; isOnline: boolean; pairedAt: string; lastSeenAt: string }> }>(
      '/devices',
      {
        method: 'GET',
      }
    ),

  unpairDevice: (deviceId: string) =>
    request<{ success: boolean; message: string }>(`/devices/${encodeURIComponent(deviceId)}`, {
      method: 'DELETE',
    }),
};

// WebRTC ICE Configuration
export const webrtcApi = {
  getIceConfig: () =>
    request<{ iceServers: RTCIceServer[]; iceTransportPolicy?: RTCIceTransportPolicy }>('/webrtc/config', {
      method: 'GET',
    }),
};
