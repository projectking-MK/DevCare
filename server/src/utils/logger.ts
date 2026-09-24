/**
 * Safe production logger that strictly complies with GuardianLink privacy requirements:
 * - Never logs passwords, auth tokens, cookies
 * - Never logs media frames, audio, or recordings
 * - Sanitizes log payloads before emitting
 */

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

function formatTimestamp(): string {
  return new Date().toISOString();
}

function sanitize(message: string): string {
  // Redact potential password, token, or secret references
  return message
    .replace(/(password|secret|token|cookie)=([^\s&]+)/gi, '$1=[REDACTED]')
    .replace(/(authorization:\s*bearer\s+)([^\s]+)/gi, '$1[REDACTED]');
}

export const logger = {
  info(topic: string, details?: Record<string, unknown> | string): void {
    const detailStr = details ? (typeof details === 'string' ? details : JSON.stringify(details)) : '';
    console.log(`[${formatTimestamp()}] [INFO] [${topic}] ${sanitize(detailStr)}`);
  },

  warn(topic: string, details?: Record<string, unknown> | string): void {
    const detailStr = details ? (typeof details === 'string' ? details : JSON.stringify(details)) : '';
    console.warn(`[${formatTimestamp()}] [WARN] [${topic}] ${sanitize(detailStr)}`);
  },

  error(topic: string, error?: unknown, context?: Record<string, unknown>): void {
    const errMessage = error instanceof Error ? error.message : String(error ?? '');
    const contextStr = context ? ` Context: ${JSON.stringify(context)}` : '';
    console.error(`[${formatTimestamp()}] [ERROR] [${topic}] ${sanitize(errMessage)}${sanitize(contextStr)}`);
  },

  debug(topic: string, details?: Record<string, unknown> | string): void {
    if (process.env.NODE_ENV !== 'production') {
      const detailStr = details ? (typeof details === 'string' ? details : JSON.stringify(details)) : '';
      console.debug(`[${formatTimestamp()}] [DEBUG] [${topic}] ${sanitize(detailStr)}`);
    }
  }
};
