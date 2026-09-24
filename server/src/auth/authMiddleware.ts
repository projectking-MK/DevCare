import { Request, Response, NextFunction } from 'express';
import { sessionStore } from '../sessions/sessionStore';
import { ParentSession } from '../sessions/types';

export const SESSION_COOKIE_NAME = 'guardian_session';

export interface AuthenticatedRequest extends Request {
  parentSession?: ParentSession;
}

/**
 * Express middleware to protect parent routes using the HttpOnly session cookie.
 */
export function requireParentAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const sessionId = req.cookies?.[SESSION_COOKIE_NAME];

  if (!sessionId) {
    res.status(401).json({
      error: 'Authentication required. No session cookie found.',
      code: 'AUTH_REQUIRED'
    });
    return;
  }

  const session = sessionStore.getSession(sessionId);

  if (!session) {
    // Clear invalid or expired cookie
    res.clearCookie(SESSION_COOKIE_NAME, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/'
    });

    res.status(401).json({
      error: 'Session has expired or is invalid. Please log in again.',
      code: 'SESSION_EXPIRED'
    });
    return;
  }

  // Attach active session to request
  req.parentSession = session;
  next();
}
