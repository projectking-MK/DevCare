import { Request, Response } from 'express';
import { z } from 'zod';
import { sessionStore } from '../sessions/sessionStore';
import { pairingService } from '../pairing/pairingService';
import { verifyPassword } from './passwordUtils';
import { SESSION_COOKIE_NAME, AuthenticatedRequest } from './authMiddleware';
import { logger } from '../utils/logger';

// Default fallback hash for dev if environment variable is missing (matches 'GuardianPass123!')
// $2a$12$f0hUf4qO0Hn5N16uW5e5Eex8d.2sR66qK.2t651Uf1gK.eN25gY1.
const DEFAULT_DEV_HASH = '$2a$12$4mU8dYv6b8ZJ1B51P6WvOuG6iXb8O0E4n4R5K6J7l8m9n0p1q2r3s';

const loginSchema = z.object({
  email: z.string().email('Invalid email address format'),
  password: z.string().min(1, 'Password is required')
});

export async function loginHandler(req: Request, res: Response): Promise<void> {
  const parseResult = loginSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      error: 'Invalid login details',
      details: parseResult.error.flatten().fieldErrors
    });
    return;
  }

  const { email, password } = parseResult.data;

  const configuredEmail = process.env.PARENT_EMAIL || 'parent@example.com';
  const configuredHash = process.env.PARENT_PASSWORD_HASH;

  // Single-owner authentication validation
  if (email.toLowerCase() !== configuredEmail.toLowerCase()) {
    logger.warn('login_failed_unknown_email', { email: '***@***' });
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }

  // If no hash is set in .env in dev, provide clear guidance
  if (!configuredHash) {
    if (process.env.NODE_ENV === 'production') {
      logger.error('login_error_missing_hash_in_production');
      res.status(500).json({ error: 'Server configuration error. Contact administrator.' });
      return;
    }
  }

  const hashToVerify = configuredHash || DEFAULT_DEV_HASH;
  const isMatch = await verifyPassword(password, hashToVerify);

  if (!isMatch) {
    logger.warn('login_failed_invalid_password', { email: configuredEmail });
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }

  // Create temporary in-memory session
  const parentId = `parent_${Buffer.from(configuredEmail).toString('base64url').slice(0, 12)}`;
  const session = sessionStore.createSession(parentId, configuredEmail);

  // Set secure HttpOnly cookie (sameSite: 'none' in production ensures cross-origin compatibility)
  const isProduction = process.env.NODE_ENV === 'production';
  res.cookie(SESSION_COOKIE_NAME, session.sessionId, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days (persists until parent clicks Logout)
  });

  logger.info('login_success', { parentId, email: configuredEmail });

  res.status(200).json({
    success: true,
    user: {
      parentId: session.parentId,
      email: session.email,
      expiresAt: session.expiresAt
    }
  });
}

export function getCurrentUserHandler(req: AuthenticatedRequest, res: Response): void {
  const session = req.parentSession;
  if (!session) {
    res.status(401).json({ authenticated: false });
    return;
  }

  res.status(200).json({
    authenticated: true,
    user: {
      parentId: session.parentId,
      email: session.email,
      expiresAt: session.expiresAt
    }
  });
}

export function logoutHandler(req: AuthenticatedRequest, res: Response): void {
  const sessionId = req.cookies?.[SESSION_COOKIE_NAME];
  if (sessionId) {
    const { parentId } = sessionStore.destroySession(sessionId);
    if (parentId) {
      pairingService.invalidateCodesForParent(parentId);
    }
  }

  // Clear cookie
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    path: '/'
  });

  logger.info('logout_completed');
  res.status(200).json({ success: true, message: 'Logged out successfully.' });
}
