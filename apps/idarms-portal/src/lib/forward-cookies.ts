/**
 * The request Cookie header after applying a response's Set-Cookie headers:
 * set cookies replace or join the request's, expired ones are removed. Lets
 * the middleware hand a refreshed session cookie (possibly chunked) on to the
 * rest of the same request.
 */
export function forwardedCookieHeader(requestCookies: string | null, setCookies: string[]): string {
  const jar = new Map<string, string>();
  for (const part of (requestCookies ?? '').split(';')) {
    const index = part.indexOf('=');
    if (index > 0) jar.set(part.slice(0, index).trim(), part.slice(index + 1).trim());
  }
  for (const header of setCookies) {
    const [pair, ...attributes] = header.split(';');
    const index = pair.indexOf('=');
    if (index <= 0) continue;
    const name = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    if (attributes.some((attribute) => isExpiry(attribute.trim()))) jar.delete(name);
    else jar.set(name, value);
  }
  return [...jar].map(([name, value]) => `${name}=${value}`).join('; ');
}

function isExpiry(attribute: string): boolean {
  const [key, value = ''] = attribute.split('=');
  const name = key.trim().toLowerCase();
  if (name === 'max-age') return Number(value) <= 0;
  if (name === 'expires') {
    const time = Date.parse(value);
    return Number.isFinite(time) && time <= Date.now();
  }
  return false;
}
