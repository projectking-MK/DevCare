import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { PairingRecord, PairedDevice } from '../sessions/types';
import { sessionStore } from '../sessions/sessionStore';
import { logger } from '../utils/logger';

const PAIRING_CODE_TTL_MS = 5 * 60 * 60 * 1000; // 5 hours

/**
 * PairingService manages secure 6-digit numeric codes and QR codes.
 * Codes are permanently valid for 5 hours and persisted to disk.
 * Pairing remains valid even if the parent logs out, closes the browser, or goes offline.
 */
class PairingService {
  private pairingCodes = new Map<string, PairingRecord>();
  private codesFilePath: string;

  constructor() {
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
    this.codesFilePath = path.join(dataDir, 'pairing_codes.json');

    this.loadCodesFromDisk();

    // Clean up expired codes periodically every 5 minutes
    setInterval(() => this.cleanupExpired(), 5 * 60 * 1000);
  }

  // --- Disk Persistence ---

  private loadCodesFromDisk(): void {
    try {
      if (fs.existsSync(this.codesFilePath)) {
        const raw = fs.readFileSync(this.codesFilePath, 'utf-8');
        const list: PairingRecord[] = JSON.parse(raw);
        const now = new Date();
        let loadedCount = 0;

        for (const item of list) {
          const expiresAt = new Date(item.expiresAt);
          if (now < expiresAt) {
            this.pairingCodes.set(item.code, {
              code: item.code,
              parentId: item.parentId,
              sessionId: item.sessionId || '',
              createdAt: new Date(item.createdAt),
              expiresAt,
              attempts: item.attempts || 0
            });
            loadedCount++;
          }
        }
        logger.info('loaded_persisted_pairing_codes', { count: loadedCount });
      }
    } catch (e) {
      logger.warn('failed_loading_persisted_pairing_codes', { error: String(e) });
    }
  }

  private saveCodesToDisk(): void {
    try {
      const now = new Date();
      const list = Array.from(this.pairingCodes.values())
        .filter(item => now < item.expiresAt)
        .map(item => ({
          code: item.code,
          parentId: item.parentId,
          sessionId: item.sessionId,
          createdAt: item.createdAt,
          expiresAt: item.expiresAt,
          attempts: item.attempts
        }));
      fs.writeFileSync(this.codesFilePath, JSON.stringify(list, null, 2), 'utf-8');
    } catch (e) {
      logger.warn('failed_saving_persisted_pairing_codes', { error: String(e) });
    }
  }

  private cleanupExpired(): void {
    const now = new Date();
    let removed = 0;
    for (const [code, record] of this.pairingCodes.entries()) {
      if (now >= record.expiresAt) {
        this.pairingCodes.delete(code);
        removed++;
      }
    }
    if (removed > 0) {
      this.saveCodesToDisk();
      logger.info('cleaned_expired_pairing_codes', { removed });
    }
  }

  /**
   * Generates a secure, readable 6-digit numeric pairing code valid for 5 hours.
   * Persisted to disk and valid even if parent logs out.
   */
  generateCode(parentId: string, sessionId: string): { code: string; expiresAt: Date } {
    // Cryptographically secure 6-digit number between 100000 and 999999
    const codeNum = crypto.randomInt(100000, 1000000);
    const code = codeNum.toString();

    const now = new Date();
    const expiresAt = new Date(now.getTime() + PAIRING_CODE_TTL_MS);

    const record: PairingRecord = {
      code,
      parentId,
      sessionId,
      createdAt: now,
      expiresAt,
      attempts: 0
    };

    this.pairingCodes.set(code, record);
    this.saveCodesToDisk();

    logger.info('pairing_code_generated_5h', { parentId, code, expiresAt: expiresAt.toISOString() });

    return { code, expiresAt };
  }

  /**
   * Verifies a pairing code and registers the paired device.
   * The code remains permanent and valid for its full 5-hour duration even after verification,
   * and remains valid even if the parent has logged out or is currently offline.
   */
  verifyAndConsume(code: string, deviceName = 'Child Device'): { success: boolean; device?: PairedDevice; error?: string } {
    const record = this.pairingCodes.get(code);

    if (!record) {
      logger.warn('pairing_failed_not_found', { code: '***' });
      return { success: false, error: 'Invalid pairing code. Please enter the 6-digit code or scan the QR code.' };
    }

    // Check expiration (5 hours)
    if (new Date() > record.expiresAt) {
      this.pairingCodes.delete(code);
      this.saveCodesToDisk();
      logger.warn('pairing_failed_expired');
      return { success: false, error: 'Pairing code has expired (valid for 5 hours). Please generate a new code from the parent dashboard.' };
    }

    // Track usage attempts
    record.attempts = (record.attempts || 0) + 1;
    this.saveCodesToDisk();

    // Create paired device record permanently tied to parentId
    const deviceId = `dev_${crypto.randomBytes(8).toString('hex')}`;
    const device: PairedDevice = {
      deviceId,
      deviceName: deviceName.trim() || 'Child Device',
      parentId: record.parentId,
      parentSessionId: record.sessionId || '',
      pairedAt: new Date(),
      isOnline: true,
      lastSeenAt: new Date()
    };

    sessionStore.registerDevice(device);
    logger.info('device_paired_successfully_5h_permanent', { deviceId, parentId: record.parentId });

    // Note: We do NOT delete the code here. The QR/code remains valid for the full 5 hours.
    return { success: true, device };
  }

  /**
   * Invalidate any pairing codes associated with a parent ID (e.g. manual rotation)
   */
  invalidateCodesForParent(parentId: string): void {
    let changed = false;
    for (const [code, record] of this.pairingCodes.entries()) {
      if (record.parentId === parentId) {
        this.pairingCodes.delete(code);
        changed = true;
      }
    }
    if (changed) {
      this.saveCodesToDisk();
    }
  }

  /**
   * Check if a parent has an active pending pairing code within the 5 hours window.
   * Returns the code with the longest remaining validity.
   */
  getActiveCodeForParent(parentId: string): { code: string; expiresAt: Date } | null {
    const now = new Date();
    const activeRecords = Array.from(this.pairingCodes.values())
      .filter(record => record.parentId === parentId && now < record.expiresAt)
      .sort((a, b) => b.expiresAt.getTime() - a.expiresAt.getTime());

    if (activeRecords.length > 0) {
      return { code: activeRecords[0].code, expiresAt: activeRecords[0].expiresAt };
    }
    return null;
  }
}

export const pairingService = new PairingService();
