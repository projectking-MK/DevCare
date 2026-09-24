import { Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { registerSocketHandlers } from './socketHandlers';
import { logger } from '../utils/logger';

let ioInstance: SocketIOServer | null = null;

export function initSocketServer(httpServer: HttpServer, frontendOrigin: string): SocketIOServer {
  const allowedOrigins = [
    frontendOrigin,
    'http://localhost:5173',
    'http://localhost:3000',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:3000'
  ];

  ioInstance = new SocketIOServer(httpServer, {
    cors: {
      origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps, curl, or same-origin in production)
        if (!origin || allowedOrigins.includes(origin) || origin.endsWith('.example.com')) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
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
