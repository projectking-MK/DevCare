import crypto from 'crypto';
import { PairingRecord, PairedDevice } from '../sessions/types';
import { sessionStore } from '../sessions/sessionStore';
import { logger } from '../utils/logger';

const PAIRING_CODE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_PAIRING_ATTEMPTS = 5;

/**
 * Temporary in-memory pairing code manager.
 * No persistent storage is used.
 */
class PairingService {
  private pairingCodes = new Map<string, PairingRecord>();

  /**
   * Generates a secure, readable 6-digit numeric pairing code
   */
  generateCode(parentId: string, sessionId: string): { code: string; expiresAt: Date } {
    // Invalidate any previous code for this parent
    this.invalidateCodesForParent(parentId);

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
    logger.info('pairing_code_generated', { parentId, expiresAt: expiresAt.toISOString() });

    return { code, expiresAt };
  }

  /**
   * Verifies and immediately consumes a pairing code, returning the newly paired device.
   */
  verifyAndConsume(code: string, deviceName = 'Child Device'): { success: boolean; device?: PairedDevice; error?: string } {
    const record = this.pairingCodes.get(code);

    if (!record) {
      logger.warn('pairing_failed_not_found', { code: '***' });
      return { success: false, error: 'Invalid or expired pairing code.' };
    }

    // Check expiration
    if (new Date() > record.expiresAt) {
      this.pairingCodes.delete(code);
      logger.warn('pairing_failed_expired');
      return { success: false, error: 'Pairing code has expired. Please generate a new code from the parent dashboard.' };
    }

    // Check attempts limit
    record.attempts += 1;
    if (record.attempts > MAX_PAIRING_ATTEMPTS) {
      this.pairingCodes.delete(code);
      logger.warn('pairing_failed_too_many_attempts');
      return { success: false, error: 'Too many failed attempts. Code has been invalidated.' };
    }

    // Verify parent session is still valid
    const parentSession = sessionStore.getSession(record.sessionId);
    if (!parentSession) {
      this.pairingCodes.delete(code);
      logger.warn('pairing_failed_parent_session_expired');
      return { success: false, error: 'Parent session is no longer active. Parent must be logged in.' };
    }

    // Successfully verified -> Invalidate pairing code immediately so it cannot be reused
    this.pairingCodes.delete(code);

    // Create paired device record
    const deviceId = `dev_${crypto.randomBytes(8).toString('hex')}`;
    const device: PairedDevice = {
      deviceId,
      deviceName: deviceName.trim() || 'Child Device',
      parentId: record.parentId,
      parentSessionId: record.sessionId,
      pairedAt: new Date(),
      isOnline: true,
      lastSeenAt: new Date()
    };

    sessionStore.registerDevice(device);
    logger.info('device_paired_successfully', { deviceId, parentId: record.parentId });

    return { success: true, device };
  }

  /**
   * Invalidate any pairing codes associated with a parent ID
   */
  invalidateCodesForParent(parentId: string): void {
    for (const [code, record] of this.pairingCodes.entries()) {
      if (record.parentId === parentId) {
        this.pairingCodes.delete(code);
      }
    }
  }

  /**
   * Check if a parent has an active pending pairing code
   */
  getActiveCodeForParent(parentId: string): { code: string; expiresAt: Date } | null {
    const now = new Date();
    for (const record of this.pairingCodes.values()) {
      if (record.parentId === parentId && now < record.expiresAt) {
        return { code: record.code, expiresAt: record.expiresAt };
      }
    }
    return null;
  }
}

export const pairingService = new PairingService();
