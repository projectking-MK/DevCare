import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: `Resource not found: ${req.method} ${req.path}`,
    code: 'NOT_FOUND'
  });
}

export function globalErrorHandler(err: unknown, req: Request, res: Response, next: NextFunction): void {
  const isProd = process.env.NODE_ENV === 'production';
  const errorMessage = err instanceof Error ? err.message : 'Internal Server Error';

  logger.error('unhandled_server_error', err, {
    method: req.method,
    path: req.path,
    ip: req.ip
  });

  if (res.headersSent) {
    return next(err);
  }

  res.status(500).json({
    error: isProd ? 'An unexpected server error occurred.' : errorMessage,
    code: 'INTERNAL_ERROR'
  });
}
