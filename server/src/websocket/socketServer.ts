import { Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { registerSocketHandlers } from './socketHandlers';
import { logger } from '../utils/logger';

import { isAllowedOrigin } from '../utils/corsHelper';

let ioInstance: SocketIOServer | null = null;

export function initSocketServer(httpServer: HttpServer, frontendOrigin: string): SocketIOServer {
  ioInstance = new SocketIOServer(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (isAllowedOrigin(origin, frontendOrigin)) {
          callback(null, true);
        } else {
          callback(new Error('Origin not allowed by CORS'));
        }
      },
      credentials: true,
      methods: ['GET', 'POST']
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 20000,
    pingInterval: 25000
  });

  registerSocketHandlers(ioInstance);

  logger.info('websocket_server_initialized');
  return ioInstance;
}

export function getSocketServer(): SocketIOServer | null {
  return ioInstance;
}
