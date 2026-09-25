import { Server as SocketIOServer, Socket } from 'socket.io';
import cookie from 'cookie';
import { sessionStore } from '../sessions/sessionStore';
import { SESSION_COOKIE_NAME } from '../auth/authMiddleware';
import { getIceConfiguration } from '../webrtc/rtcConfig';
import { logger } from '../utils/logger';

interface SocketAuthData {
  role?: 'parent' | 'child';
  parentId?: string;
  deviceId?: string;
}

export function registerSocketHandlers(io: SocketIOServer): void {
  io.on('connection', (socket: Socket) => {
    const socketData: SocketAuthData = {};

    logger.info('socket_connected', { socketId: socket.id });

    // Send ICE config on request
    socket.on('webrtc:get_ice_config', (callback) => {
      if (typeof callback === 'function') {
        callback(getIceConfiguration());
      }
    });

    // 1. Parent socket authentication
    socket.on('auth:parent', (arg1, arg2) => {
      const payload = typeof arg1 === 'object' && arg1 !== null ? arg1 : {};
      const callback = typeof arg1 === 'function' ? arg1 : (typeof arg2 === 'function' ? arg2 : undefined);

      try {
        let parentId: string | undefined;

        // Try reading session cookie first
        const rawCookies = socket.handshake.headers.cookie;
        if (rawCookies) {
          const parsedCookies = cookie.parse(rawCookies);
          const sessionId = parsedCookies[SESSION_COOKIE_NAME];
          const session = sessionStore.getSession(sessionId);
          if (session) {
            parentId = session.parentId;
          }
        }

        // Fallback: If payload.parentId is provided, verify against single-owner parentId
        if (!parentId && payload.parentId && typeof payload.parentId === 'string') {
          const configuredEmail = process.env.PARENT_EMAIL || 'parent@example.com';
          const expectedParentId = `parent_${Buffer.from(configuredEmail).toString('base64url').slice(0, 12)}`;
          if (payload.parentId === expectedParentId) {
            parentId = expectedParentId;
          }
        }

        if (!parentId) {
          if (callback) callback({ success: false, error: 'Parent authentication required.' });
          return;
        }

        socketData.role = 'parent';
        socketData.parentId = parentId;
        socket.join(`parent_${parentId}`);

        logger.info('parent_socket_authenticated', { parentId, socketId: socket.id });
        if (callback) callback({ success: true, parentId });
      } catch (err) {
        logger.error('parent_socket_auth_error', err);
        if (callback) callback({ success: false, error: 'Authentication failed.' });
      }
    });

    // 2. Child device socket authentication
    socket.on('auth:child', (payload: { deviceId: string; parentId?: string; deviceName?: string }, callback) => {
      try {
        if (!payload || !payload.deviceId || typeof payload.deviceId !== 'string') {
          if (callback) callback({ success: false, error: 'Invalid deviceId.' });
          return;
        }

        let device = sessionStore.getDevice(payload.deviceId);

        // Auto-recovery / persistent one-time pairing:
        // If device was paired before and provides valid credentials, restore it!
        if (!device && payload.parentId && payload.deviceName) {
          logger.info('restoring_paired_child_device', { deviceId: payload.deviceId, parentId: payload.parentId });
          device = {
            deviceId: payload.deviceId,
            deviceName: payload.deviceName,
            parentId: payload.parentId,
            parentSessionId: '',
            pairedAt: new Date(),
            isOnline: true,
            socketId: socket.id,
            lastSeenAt: new Date()
          };
          sessionStore.registerDevice(device);
        }

        if (!device) {
          if (callback) callback({ success: false, error: 'Device not recognized or unpaired.' });
          return;
        }

        socketData.role = 'child';
        socketData.deviceId = device.deviceId;
        socketData.parentId = device.parentId;

        sessionStore.setDeviceOnline(device.deviceId, socket.id);
        socket.join(`device_${device.deviceId}`);

        // Notify parent that child device came online
        io.to(`parent_${device.parentId}`).emit('device:status', {
          deviceId: device.deviceId,
          isOnline: true
        });

        logger.info('child_socket_authenticated', { deviceId: device.deviceId, socketId: socket.id });
        if (callback) callback({ success: true, deviceName: device.deviceName, parentId: device.parentId });
      } catch (err) {
        logger.error('child_socket_auth_error', err);
        if (callback) callback({ success: false, error: 'Authentication failed.' });
      }
    });

    // 3. Parent initiates monitoring request
    socket.on('monitoring:request', (payload: { deviceId: string; camera: boolean; microphone: boolean }, callback) => {
      if (socketData.role !== 'parent' || !socketData.parentId) {
        if (callback) callback({ success: false, error: 'Unauthorized. Parent authentication required.' });
        return;
      }

      const { deviceId, camera = true, microphone = true } = payload;
      const device = sessionStore.getDevice(deviceId);

      if (!device || device.parentId !== socketData.parentId) {
        if (callback) callback({ success: false, error: 'Device not found or not paired to your account.' });
        return;
      }

      if (!device.isOnline || !device.socketId) {
        if (callback) callback({ success: false, error: 'Child device is currently offline.' });
        return;
      }

      // Check if already active
      const active = sessionStore.getActiveMonitoringForDevice(deviceId);
      if (active && active.status === 'active') {
        if (callback) callback({ success: false, error: 'A monitoring session is already active for this device.' });
        return;
      }

      const monitoringSession = sessionStore.createMonitoringSession(
        socketData.parentId,
        deviceId,
        Boolean(camera),
        Boolean(microphone)
      );

      // Relay transparent request to child device
      io.to(`device_${deviceId}`).emit('monitoring:incoming_request', {
        sessionId: monitoringSession.sessionId,
        camera: monitoringSession.cameraRequested,
        microphone: monitoringSession.micRequested,
        parentId: socketData.parentId
      });

      logger.info('monitoring_requested', {
        sessionId: monitoringSession.sessionId,
        deviceId,
        camera: monitoringSession.cameraRequested,
        microphone: monitoringSession.micRequested
      });

      if (callback) {
        callback({ success: true, sessionId: monitoringSession.sessionId });
      }
    });

    // 4. Child responds to monitoring request (Allow or Deny)
    socket.on('monitoring:response', (payload: { sessionId: string; approved: boolean; reason?: string }) => {
      if (socketData.role !== 'child' || !socketData.deviceId) {
        return;
      }

      const { sessionId, approved, reason } = payload;
      const session = sessionStore.getMonitoringSession(sessionId);

      if (!session || session.deviceId !== socketData.deviceId) {
        return;
      }

      if (approved) {
        sessionStore.updateMonitoringSession(sessionId, {
          status: 'active',
          cameraActive: session.cameraRequested,
          micActive: session.micRequested
        });

        // Notify parent that child explicitly allowed monitoring
        io.to(`parent_${session.parentId}`).emit('monitoring:started', {
          sessionId,
          deviceId: session.deviceId,
          cameraActive: session.cameraRequested,
          micActive: session.micRequested,
          startedAt: new Date().toISOString()
        });

        // Confirm to child
        socket.emit('monitoring:active_confirmed', {
          sessionId,
          cameraActive: session.cameraRequested,
          micActive: session.micRequested
        });

        logger.info('monitoring_explicitly_approved_by_child', { sessionId, deviceId: session.deviceId });
      } else {
        sessionStore.updateMonitoringSession(sessionId, { status: 'denied' });

        io.to(`parent_${session.parentId}`).emit('monitoring:denied', {
          sessionId,
          deviceId: session.deviceId,
          reason: reason || 'Child declined the monitoring request.'
        });

        logger.info('monitoring_declined_by_child', { sessionId, deviceId: session.deviceId });
      }
    });

    // 5. WebRTC Signaling: Offer from Child to Parent
    socket.on('webrtc:offer', (payload: { sessionId: string; sdp: RTCSessionDescriptionInit }) => {
      const { sessionId, sdp } = payload;
      const session = sessionStore.getMonitoringSession(sessionId);
      if (!session) return;

      // Only allow sending offer if monitoring is active
      if (session.status !== 'active') return;

      // Forward to parent
      io.to(`parent_${session.parentId}`).emit('webrtc:offer', {
        sessionId,
        sdp
      });
    });

    // 6. WebRTC Signaling: Answer from Parent to Child
    socket.on('webrtc:answer', (payload: { sessionId: string; sdp: RTCSessionDescriptionInit }) => {
      const { sessionId, sdp } = payload;
      const session = sessionStore.getMonitoringSession(sessionId);
      if (!session) return;

      // Forward to child
      io.to(`device_${session.deviceId}`).emit('webrtc:answer', {
        sessionId,
        sdp
      });
    });

    // 7. WebRTC Signaling: ICE Candidate Exchange
    socket.on('webrtc:ice_candidate', (payload: { sessionId: string; candidate: RTCIceCandidateInit }) => {
      const { sessionId, candidate } = payload;
      const session = sessionStore.getMonitoringSession(sessionId);
      if (!session) return;

      if (socketData.role === 'child') {
        io.to(`parent_${session.parentId}`).emit('webrtc:ice_candidate', {
          sessionId,
          candidate
        });
      } else if (socketData.role === 'parent') {
        io.to(`device_${session.deviceId}`).emit('webrtc:ice_candidate', {
          sessionId,
          candidate
        });
      }
    });

    // 8. WebRTC Signaling: ICE Restart Request
    socket.on('webrtc:ice_restart', (payload: { sessionId: string }) => {
      const session = sessionStore.getMonitoringSession(payload.sessionId);
      if (!session) return;

      if (socketData.role === 'parent') {
        io.to(`device_${session.deviceId}`).emit('webrtc:ice_restart', { sessionId: session.sessionId });
      } else if (socketData.role === 'child') {
        io.to(`parent_${session.parentId}`).emit('webrtc:ice_restart', { sessionId: session.sessionId });
      }
    });

    // 9. Stop Monitoring (can be called by either Child or Parent at any moment!)
    socket.on('monitoring:stop', (payload: { sessionId: string; reason?: string }) => {
      const { sessionId, reason } = payload;
      const session = sessionStore.getMonitoringSession(sessionId);
      if (!session) return;

      const stoppedBy = socketData.role || 'unknown';
      const terminationMsg = stoppedBy === 'child'
        ? 'Child stopped monitoring.'
        : 'Parent stopped monitoring.';

      sessionStore.terminateMonitoringSession(sessionId);

      // Notify parent
      io.to(`parent_${session.parentId}`).emit('monitoring:stopped', {
        sessionId,
        by: stoppedBy,
        message: reason || terminationMsg
      });

      // Notify child
      io.to(`device_${session.deviceId}`).emit('monitoring:stopped', {
        sessionId,
        by: stoppedBy,
        message: reason || terminationMsg
      });

      logger.info('monitoring_stopped', { sessionId, stoppedBy, reason });
    });

    // 10. Disconnect Handler
    socket.on('disconnect', () => {
      logger.info('socket_disconnected', { socketId: socket.id, role: socketData.role });

      if (socketData.role === 'child' && socketData.deviceId) {
        sessionStore.setDeviceOffline(socketData.deviceId);

        // Notify parent of offline status
        if (socketData.parentId) {
          io.to(`parent_${socketData.parentId}`).emit('device:status', {
            deviceId: socketData.deviceId,
            isOnline: false
          });
        }

        // Clean up any active monitoring session for this device
        const activeMon = sessionStore.getActiveMonitoringForDevice(socketData.deviceId);
        if (activeMon) {
          sessionStore.terminateMonitoringSession(activeMon.sessionId);
          io.to(`parent_${activeMon.parentId}`).emit('monitoring:stopped', {
            sessionId: activeMon.sessionId,
            by: 'child_disconnect',
            message: 'Child device disconnected from network.'
          });
        }
      } else if (socketData.role === 'parent' && socketData.parentId) {
        // Check if parent has any other active sockets
        const parentRoom = io.sockets.adapter.rooms.get(`parent_${socketData.parentId}`);
        if (!parentRoom || parentRoom.size === 0) {
          const activeMon = sessionStore.getActiveMonitoringForParent(socketData.parentId);
          if (activeMon) {
            sessionStore.terminateMonitoringSession(activeMon.sessionId);
            io.to(`device_${activeMon.deviceId}`).emit('monitoring:stopped', {
              sessionId: activeMon.sessionId,
              by: 'parent_disconnect',
              message: 'Parent disconnected.'
            });
          }
        }
      }
    });
  });
}
