export interface ParentSession {
  sessionId: string;
  parentId: string;
  email: string;
  createdAt: Date;
  expiresAt: Date;
  lastActivityAt: Date;
}

export interface PairingRecord {
  code: string;
  parentId: string;
  sessionId: string;
  createdAt: Date;
  expiresAt: Date;
  attempts: number;
}

export interface PairedDevice {
  deviceId: string;
  deviceName: string;
  parentId: string;
  parentSessionId: string;
  pairedAt: Date;
  isOnline: boolean;
  socketId?: string;
  lastSeenAt: Date;
}

export interface ActiveMonitoringSession {
  sessionId: string;
  parentId: string;
  deviceId: string;
  status: 'idle' | 'requested' | 'active' | 'denied' | 'stopped';
  cameraRequested: boolean;
  micRequested: boolean;
  cameraActive: boolean;
  micActive: boolean;
  startedAt?: Date;
  endedAt?: Date;
}
