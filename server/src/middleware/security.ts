import { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';

/**
 * Production security headers configured specifically for WebRTC child-safety application.
 * Carefully configures Permissions-Policy to allow camera and microphone on self origin
 * without leaking to 3rd party frames.
 */
export function configureSecurityHeaders() {
  return [
    // Standard Helmet protections
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"], // Allow bundled Vite scripts
          styleSrc: ["'self'", "'unsafe-inline'"],  // Allow Tailwind inline styles
          imgSrc: ["'self'", 'data:', 'blob:'],
          mediaSrc: ["'self'", 'blob:'],            // Allow blob: for local recordings playback
          connectSrc: [
            "'self'",
            'ws:',
            'wss:',
            'http:',
            'https:'
          ],
          fontSrc: ["'self'", 'data:'],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],              // Prevent clickjacking
          upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null
        }
      },
      crossOriginEmbedderPolicy: false,             // Needed for WebRTC / media playback
      crossOriginResourcePolicy: { policy: 'cross-origin' }
    }),

    // Custom Permissions-Policy explicitly allowing camera & microphone for self
    (req: Request, res: Response, next: NextFunction) => {
      res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), display-capture=()');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

      if (process.env.NODE_ENV === 'production') {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
      }

      next();
    }
  ];
}
