/**
 * Robust origin checker for production and preview environments.
 * Allows same-origin, localhost, Render, Vercel, and explicitly configured FRONTEND_URL.
 */
export function isAllowedOrigin(origin?: string, configuredFrontendUrl?: string): boolean {
  if (!origin) return true; // Direct navigation, same-origin, curl, mobile native apps

  const rawConfigured = configuredFrontendUrl || process.env.FRONTEND_URL || '';
  if (rawConfigured === '*') return true;

  // Split multiple comma-separated URLs if present
  const allowedList = rawConfigured.split(',').map((u) => u.trim().replace(/\/+$/, '')).filter(Boolean);

  const cleanOrigin = origin.replace(/\/+$/, '');

  if (allowedList.some((allowed) => cleanOrigin === allowed || cleanOrigin.startsWith(allowed))) {
    return true;
  }

  // Local development origins
  if (cleanOrigin.includes('localhost') || cleanOrigin.includes('127.0.0.1')) {
    return true;
  }

  // Cloud deployment platform subdomains
  if (
    cleanOrigin.endsWith('.onrender.com') ||
    cleanOrigin.endsWith('.vercel.app') ||
    cleanOrigin.endsWith('.up.railway.app') ||
    cleanOrigin.endsWith('.loca.lt') ||
    cleanOrigin.endsWith('.netlify.app') ||
    cleanOrigin.endsWith('.example.com')
  ) {
    return true;
  }

  return false;
}
