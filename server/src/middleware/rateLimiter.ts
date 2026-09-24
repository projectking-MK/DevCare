import rateLimit from 'express-rate-limit';

/**
 * Login rate limiter: Max 10 attempts per 15 minutes per IP
 */
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many login attempts. Please wait 15 minutes before trying again.'
  }
});

/**
 * Pairing rate limiter: Max 10 attempts per 15 minutes per IP to prevent code brute-forcing
 */
export const pairingRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many pairing verification attempts. Please wait before trying again.'
  }
});

/**
 * General API rate limiter: Max 300 requests per minute
 */
export const generalApiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests. Please slow down.'
  }
});
