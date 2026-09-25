import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { ParentSession, PairedDevice, ActiveMonitoringSession } from './types';
import { logger } from '../utils/logger';

// Session lifetime limits (Persists until user clicks Logout)
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days max (until logout)

/**
 * SessionStore manages authenticated parent sessions and paired child devices.
 * Both parent sessions and paired child devices are permanently persisted to disk
 * so parents and children only ever pair once and stay connected until they explicitly click Logout or Unpair.
 */
class SessionStore {
  private authenticatedSessions = new Map<string, ParentSession>();
  private pairedDevices = new Map<string, PairedDevice>();
  private activeMonitoringSessions = new Map<string, ActiveMonitoringSession>();
  private devicesFilePath: string;
  private sessionsFilePath: string;

  constructor() {
    // Determine data directory for persisting paired devices and sessions
    const serverDir = path.resolve(process.cwd(), 'server');
    const baseDir = fs.existsSync(serverDir) && fs.statSync(serverDir).isDirectory() ? serverDir : process.cwd();
    const dataDir = path.resolve(baseDir, 'data');
    try {
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
    } catch {
      // Ignore
    }
    this.devicesFilePath = path.join(dataDir, 'paired_devices.json');
    this.sessionsFilePath = path.join(dataDir, 'parent_sessions.json');

    this.loadDevicesFromDisk();
    this.loadSessionsFromDisk();

    // Periodic cleanup of expired parent sessions every 1 hour
    setInterval(() => this.cleanupExpired(), 60 * 60 * 1000);
  }

  // --- Persistent Device Store Helpers ---

  private loadDevicesFromDisk(): void {
    try {
      if (fs.existsSync(this.devicesFilePath)) {
        const raw = fs.readFileSync(this.devicesFilePath, 'utf-8');
        const list: PairedDevice[] = JSON.parse(raw);
        for (const dev of list) {
          this.pairedDevices.set(dev.deviceId, {
            ...dev,
            pairedAt: new Date(dev.pairedAt),
            lastSeenAt: dev.lastSeenAt ? new Date(dev.lastSeenAt) : new Date(),
            isOnline: false,
            socketId: undefined
          });
        }
        logger.info('loaded_persisted_devices', { count: this.pairedDevices.size });
      }
    } catch (e) {
      logger.warn('failed_loading_persisted_devices', { error: String(e) });
    }
  }

  private saveDevicesToDisk(): void {
    try {
      const list = Array.from(this.pairedDevices.values()).map((dev) => ({
        deviceId: dev.deviceId,
        deviceName: dev.deviceName,
        parentId: dev.parentId,
        parentSessionId: dev.parentSessionId,
        pairedAt: dev.pairedAt,
        lastSeenAt: dev.lastSeenAt
      }));
      fs.writeFileSync(this.devicesFilePath, JSON.stringify(list, null, 2), 'utf-8');
    } catch (e) {
      logger.warn('failed_saving_persisted_devices', { error: String(e) });
    }
  }

  // --- Persistent Parent Sessions Helpers ---

  private loadSessionsFromDisk(): void {
    try {
      if (fs.existsSync(this.sessionsFilePath)) {
        const raw = fs.readFileSync(this.sessionsFilePath, 'utf-8');
        const list: ParentSession[] = JSON.parse(raw);
        const now = new Date();
        for (const s of list) {
          const expiresAt = new Date(s.expiresAt);
          if (now < expiresAt) {
            this.authenticatedSessions.set(s.sessionId, {
              ...s,
              createdAt: new Date(s.createdAt),
              expiresAt,
              lastActivityAt: s.lastActivityAt ? new Date(s.lastActivityAt) : new Date()
            });
          }
        }
        logger.info('loaded_persisted_parent_sessions', { count: this.authenticatedSessions.size });
      }
    } catch (e) {
      logger.warn('failed_loading_persisted_parent_sessions', { error: String(e) });
    }
  }

  private saveSessionsToDisk(): void {
    try {
      const list = Array.from(this.authenticatedSessions.values()).map((s) => ({
        sessionId: s.sessionId,
        parentId: s.parentId,
        email: s.email,
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
        lastActivityAt: s.lastActivityAt
      }));
      fs.writeFileSync(this.sessionsFilePath, JSON.stringify(list, null, 2), 'utf-8');
    } catch (e) {
      logger.warn('failed_saving_persisted_parent_sessions', { error: String(e) });
    }
  }

  // --- Parent Session Management ---

  createSession(parentId: string, email: string): ParentSession {
    const sessionId = crypto.randomBytes(32).toString('hex');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

    const session: ParentSession = {
      sessionId,
      parentId,
      email,
      createdAt: now,
      expiresAt,
      lastActivityAt: now,
    };

    this.authenticatedSessions.set(sessionId, session);
    this.saveSessionsToDisk();
    logger.info('session_created', { parentId, email, expiresAt: expiresAt.toISOString() });
    return session;
  }

  getSession(sessionId?: string): ParentSession | null {
    if (!sessionId) return null;
    const session = this.authenticatedSessions.get(sessionId);
    if (!session) return null;

    const now = new Date();
    // Check hard expiry (30 days)
    if (now > session.expiresAt) {
      this.destroySession(sessionId);
      return null;
    }

    session.lastActivityAt = now;
    return session;
  }

  touchSession(sessionId: string): void {
    const session = this.authenticatedSessions.get(sessionId);
    if (session) {
      session.lastActivityAt = new Date();
    }
  }

  destroySession(sessionId: string): { parentId?: string } {
    const session = this.authenticatedSessions.get(sessionId);
    if (!session) return {};

    const parentId = session.parentId;
    this.authenticatedSessions.delete(sessionId);
    this.saveSessionsToDisk();

    // Stop any active monitoring session tied to this parent
    for (const [monitoringId, mon] of this.activeMonitoringSessions.entries()) {
      if (mon.parentId === parentId) {
        this.activeMonitoringSessions.delete(monitoringId);
        logger.info('monitoring_session_terminated_on_logout', { monitoringId, parentId });
      }
    }

    logger.info('session_destroyed', { parentId });
    return { parentId };
  }

  // --- Device Pairing Store (Persistent) ---

  registerDevice(device: PairedDevice): void {
    this.pairedDevices.set(device.deviceId, device);
    this.saveDevicesToDisk();
    logger.info('device_registered', { deviceId: device.deviceId, parentId: device.parentId });
  }

  getDevice(deviceId: string): PairedDevice | null {
    return this.pairedDevices.get(deviceId) || null;
  }

  getDevicesByParent(parentId: string): PairedDevice[] {
    return Array.from(this.pairedDevices.values()).filter(d => d.parentId === parentId);
  }

  setDeviceOnline(deviceId: string, socketId?: string): void {
    const dev = this.pairedDevices.get(deviceId);
    if (dev) {
      dev.isOnline = true;
      dev.socketId = socketId;
      dev.lastSeenAt = new Date();
    }
  }

  setDeviceOffline(deviceId: string): void {
    const dev = this.pairedDevices.get(deviceId);
    if (dev) {
      dev.isOnline = false;
      dev.socketId = undefined;
      dev.lastSeenAt = new Date();
    }
  }

  removeDevice(deviceId: string): boolean {
    const deleted = this.pairedDevices.delete(deviceId);
    if (deleted) {
      this.saveDevicesToDisk();
    }
    return deleted;
  }

  // --- Active Monitoring Sessions ---

  createMonitoringSession(parentId: string, deviceId: string, camera: boolean, mic: boolean): ActiveMonitoringSession {
    const sessionId = crypto.randomUUID();
    const session: ActiveMonitoringSession = {
      sessionId,
      parentId,
      deviceId,
      status: 'requested',
      cameraRequested: camera,
      micRequested: mic,
      cameraActive: false,
      micActive: false,
      startedAt: new Date()
    };
    this.activeMonitoringSessions.set(sessionId, session);
    return session;
  }

  getMonitoringSession(sessionId: string): ActiveMonitoringSession | null {
    return this.activeMonitoringSessions.get(sessionId) || null;
  }

  getActiveMonitoringForDevice(deviceId: string): ActiveMonitoringSession | null {
    for (const mon of this.activeMonitoringSessions.values()) {
      if (mon.deviceId === deviceId && (mon.status === 'requested' || mon.status === 'active')) {
        return mon;
      }
    }
    return null;
  }

  getActiveMonitoringForParent(parentId: string): ActiveMonitoringSession | null {
    for (const mon of this.activeMonitoringSessions.values()) {
      if (mon.parentId === parentId && (mon.status === 'requested' || mon.status === 'active')) {
        return mon;
      }
    }
    return null;
  }

  updateMonitoringSession(sessionId: string, updates: Partial<ActiveMonitoringSession>): void {
    const existing = this.activeMonitoringSessions.get(sessionId);
    if (existing) {
      Object.assign(existing, updates);
    }
  }

  terminateMonitoringSession(sessionId: string): ActiveMonitoringSession | null {
    const existing = this.activeMonitoringSessions.get(sessionId);
    if (existing) {
      existing.status = 'stopped';
      existing.endedAt = new Date();
      existing.cameraActive = false;
      existing.micActive = false;
      this.activeMonitoringSessions.delete(sessionId);
      logger.info('monitoring_session_terminated', { sessionId, deviceId: existing.deviceId });
      return existing;
    }
    return null;
  }

  // Periodic cleanup of expired parent sessions (past 30-day hard limit)
  private cleanupExpired(): void {
    const now = new Date();
    for (const [id, session] of this.authenticatedSessions.entries()) {
      if (now > session.expiresAt) {
        this.destroySession(id);
      }
    }
  }
}

export const sessionStore = new SessionStore();
