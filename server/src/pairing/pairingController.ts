import { Request, Response } from 'express';
import { z } from 'zod';
import { pairingService } from './pairingService';
import { sessionStore } from '../sessions/sessionStore';
import { AuthenticatedRequest } from '../auth/authMiddleware';
import { getSocketServer } from '../websocket/socketServer';

const verifyCodeSchema = z.object({
  code: z.string().trim().length(6, 'Pairing code must be exactly 6 digits').regex(/^\d{6}$/, 'Pairing code must contain only numbers'),
  deviceName: z.string().trim().max(50).optional()
});

/**
 * Parent creates a temporary 6-digit pairing code
 */
export function generatePairingCodeHandler(req: AuthenticatedRequest, res: Response): void {
  const session = req.parentSession;
  if (!session) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const { code, expiresAt } = pairingService.generateCode(session.parentId, session.sessionId);
  res.status(200).json({
    success: true,
    code,
    expiresAt: expiresAt.toISOString()
  });
}

/**
 * Parent checks for any active pending pairing code
 */
export function getActivePairingCodeHandler(req: AuthenticatedRequest, res: Response): void {
  const session = req.parentSession;
  if (!session) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const active = pairingService.getActiveCodeForParent(session.parentId);
  if (!active) {
    res.status(200).json({ hasActiveCode: false });
    return;
  }

  res.status(200).json({
    hasActiveCode: true,
    code: active.code,
    expiresAt: active.expiresAt.toISOString()
  });
}

/**
 * Child device submits the 6-digit code to pair with parent
 */
export function verifyPairingCodeHandler(req: Request, res: Response): void {
  const parseResult = verifyCodeSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      error: 'Invalid pairing code format. Please enter a valid 6-digit code.',
      details: parseResult.error.flatten().fieldErrors
    });
    return;
  }

  const { code, deviceName } = parseResult.data;
  const result = pairingService.verifyAndConsume(code, deviceName);

  if (!result.success || !result.device) {
    res.status(400).json({
      success: false,
      error: result.error || 'Failed to verify pairing code.'
    });
    return;
  }

  // Notify parent dashboard via WebSockets if connected
  const io = getSocketServer();
  if (io) {
    io.to(`parent_${result.device.parentId}`).emit('device:paired', {
      device: {
        deviceId: result.device.deviceId,
        deviceName: result.device.deviceName,
        isOnline: result.device.isOnline,
        pairedAt: result.device.pairedAt
      }
    });
  }

  res.status(200).json({
    success: true,
    device: {
      deviceId: result.device.deviceId,
      deviceName: result.device.deviceName,
      parentId: result.device.parentId,
      pairedAt: result.device.pairedAt
    }
  });
}

/**
 * Parent lists their registered/paired devices
 */
export function listPairedDevicesHandler(req: AuthenticatedRequest, res: Response): void {
  const session = req.parentSession;
  if (!session) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const devices = sessionStore.getDevicesByParent(session.parentId);
  res.status(200).json({
    success: true,
    devices: devices.map(d => ({
      deviceId: d.deviceId,
      deviceName: d.deviceName,
      isOnline: d.isOnline,
      pairedAt: d.pairedAt,
      lastSeenAt: d.lastSeenAt
    }))
  });
}

/**
 * Parent removes/unpairs a child device
 */
export function unpairDeviceHandler(req: AuthenticatedRequest, res: Response): void {
  const session = req.parentSession;
  if (!session) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const deviceId = Array.isArray(req.params.deviceId) ? req.params.deviceId[0] : req.params.deviceId;
  if (!deviceId) {
    res.status(400).json({ error: 'Device ID is required' });
    return;
  }
  const device = sessionStore.getDevice(deviceId);

  if (!device || device.parentId !== session.parentId) {
    res.status(404).json({ error: 'Device not found or not owned by you.' });
    return;
  }

  // Terminate any active monitoring
  const activeMon = sessionStore.getActiveMonitoringForDevice(deviceId);
  if (activeMon) {
    sessionStore.terminateMonitoringSession(activeMon.sessionId);
  }

  // Notify child socket to unpair
  const io = getSocketServer();
  if (io) {
    io.to(`device_${deviceId}`).emit('device:unpaired', {
      reason: 'Parent has removed this device relationship.'
    });
  }

  sessionStore.removeDevice(deviceId);

  res.status(200).json({ success: true, message: 'Device unpaired successfully.' });
}
