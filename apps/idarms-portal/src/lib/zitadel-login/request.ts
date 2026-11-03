/**
 * The portal's public origin, from configuration only. Reset and invite links
 * are built from it, so it must never come from a request's Host header.
 */
export function portalUrl(): string {
  const value = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? 'http://localhost:3000';
  const url = new URL(value);
  if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
    throw new Error('AUTH_URL must use https when NODE_ENV=production');
  }
  return url.origin;
}

/**
 * A same-site path to return to after sign-in; anything else becomes
 * /dashboard. An absolute URL counts only when it is on the portal's origin.
 */
export function safeRedirectPath(value: unknown, origin?: string): string {
  if (typeof value === 'string' && origin && /^https?:\/\//i.test(value)) {
    try {
      const absolute = new URL(value);
      if (absolute.origin !== new URL(origin).origin) return '/dashboard';
      value = `${absolute.pathname}${absolute.search}`;
    } catch {
      return '/dashboard';
    }
  }
  if (typeof value !== 'string' || !value.startsWith('/')) return '/dashboard';
  if (value.startsWith('//') || value.startsWith('/\\') || value.startsWith('/api/auth')) return '/dashboard';
  try {
    const parsed = new URL(value, 'http://portal.invalid');
    if (parsed.origin !== 'http://portal.invalid') return '/dashboard';
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return '/dashboard';
  }
}

/** First hop of x-forwarded-for. Only meaningful behind a proxy that sets it. */
export function clientIp(headers: Headers): string {
  return headers.get('x-forwarded-for')?.split(',')[0]?.trim() || headers.get('x-real-ip') || 'unknown';
}

export const isZitadelId = (value: unknown): value is string => typeof value === 'string' && /^\d{1,32}$/.test(value);
