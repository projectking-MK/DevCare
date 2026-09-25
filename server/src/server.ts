import path from 'path';
import http from 'http';
import express, { Request, Response } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import fs from 'fs';

// Load environment variables (from server/.env or root .env)
dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { logger } from './utils/logger';
import { configureSecurityHeaders } from './middleware/security';
import { loginRateLimiter, pairingRateLimiter, generalApiRateLimiter } from './middleware/rateLimiter';
import { globalErrorHandler, notFoundHandler } from './middleware/errorHandler';
import { requireParentAuth } from './auth/authMiddleware';
import { loginHandler, getCurrentUserHandler, logoutHandler } from './auth/authController';
import {
  generatePairingCodeHandler,
  getActivePairingCodeHandler,
  verifyPairingCodeHandler,
  listPairedDevicesHandler,
  unpairDeviceHandler
} from './pairing/pairingController';
import { getIceConfiguration } from './webrtc/rtcConfig';
import { initSocketServer } from './websocket/socketServer';
import { isAllowedOrigin } from './utils/corsHelper';

const app = express();
const httpServer = http.createServer(app);

// Trust proxy for secure cookies and rate-limiting behind reverse proxy in production
app.set('trust proxy', 1);

const isProduction = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT) || 3000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// 1. Security Headers Middleware
app.use(configureSecurityHeaders());

// 2. Static Frontend Assets Serving (served before CORS so JS/CSS and static files never fail with CORS errors)
const clientDistPath = path.resolve(__dirname, '../../client/dist');
const altClientDistPath = path.resolve(__dirname, '../public');
const activeStaticPath = fs.existsSync(clientDistPath)
  ? clientDistPath
  : (fs.existsSync(altClientDistPath) ? altClientDistPath : null);

if (activeStaticPath) {
  logger.info('serving_static_client', { path: activeStaticPath });
  app.use(express.static(activeStaticPath, {
    maxAge: '1h',
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache');
      }
    }
  }));
}

// 3. CORS Configuration for API & WebSocket endpoints (Graceful rejection without throwing 500)
app.use(cors({
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin, FRONTEND_URL)) {
      callback(null, true);
    } else {
      logger.warn('cors_rejected_origin', { origin });
      callback(null, false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// 4. Parsers
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());

// 5. Rate Limiting on General API
app.use('/api', generalApiRateLimiter);

// 6. Health Check Endpoint (Complies with Requirement 32: status: "ok" only)
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

// 7. Authentication Endpoints
app.post('/api/auth/login', loginRateLimiter, loginHandler);
app.get('/api/auth/me', requireParentAuth, getCurrentUserHandler);
app.post('/api/auth/logout', logoutHandler);

// 8. Temporary Pairing Endpoints
app.post('/api/pairing/generate', requireParentAuth, generatePairingCodeHandler);
app.get('/api/pairing/active', requireParentAuth, getActivePairingCodeHandler);
app.post('/api/pairing/verify', pairingRateLimiter, verifyPairingCodeHandler);
app.get('/api/devices', requireParentAuth, listPairedDevicesHandler);
app.delete('/api/devices/:deviceId', requireParentAuth, unpairDeviceHandler);

// 9. WebRTC ICE Server Configuration
app.get('/api/webrtc/config', (_req: Request, res: Response) => {
  res.status(200).json(getIceConfiguration());
});

// 10. SPA fallback for HTML5 history API routes (/child, /login, /recordings, /sessions, etc.)
if (activeStaticPath) {
  app.get('*', (req: Request, res: Response, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
      return next();
    }
    res.sendFile(path.join(activeStaticPath, 'index.html'));
  });
}

// 11. Centralized Error Handlers
app.use('/api/*', notFoundHandler);
app.use(globalErrorHandler);

// 12. Initialize Socket.IO Server
initSocketServer(httpServer, FRONTEND_URL);

// 13. Start HTTP/WS Server
httpServer.listen(PORT, '0.0.0.0', () => {
  logger.info('server_started', {
    port: PORT,
    environment: isProduction ? 'production' : 'development',
    frontendUrl: FRONTEND_URL
  });
  console.log(`\n======================================================`);
  console.log(`🛡️  GuardianLink Server running on port ${PORT}`);
  console.log(`🌐  Environment: ${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'}`);
  console.log(`📡  Socket.IO signaling ready`);
  console.log(`🩺  Health check: http://localhost:${PORT}/health`);
  console.log(`======================================================\n`);
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  logger.info('sigterm_received_shutting_down');
  httpServer.close(() => {
    process.exit(0);
  });
});
