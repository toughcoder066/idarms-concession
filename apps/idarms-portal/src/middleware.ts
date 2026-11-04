import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server';
import { auth } from '@/auth';
import { forwardedCookieHeader } from '@/lib/forward-cookies';

const authMiddleware = auth as unknown as (request: NextRequest, event: NextFetchEvent) => Promise<Response>;

/**
 * Auth.js refreshes an expiring access token here and sends the new session
 * cookie to the browser. The page or server action behind this request would
 * still read the old cookie and refresh again with a refresh token ZITADEL has
 * already rotated, which fails and ends the session. So the new cookie is also
 * handed on to the rest of this request.
 */
export async function middleware(request: NextRequest, event: NextFetchEvent) {
  const response = await authMiddleware(request, event);
  const setCookies = response.headers.getSetCookie();
  if (setCookies.length === 0 || !response.headers.has('x-middleware-next')) return response;

  const headers = new Headers(request.headers);
  headers.set('cookie', forwardedCookieHeader(request.headers.get('cookie'), setCookies));
  const forwarded = NextResponse.next({ request: { headers } });
  for (const cookie of setCookies) forwarded.headers.append('set-cookie', cookie);
  return forwarded;
}

export const config = {
  matcher: [
    // Protect everything except the portal's own login pages (login, password
    // reset and change, invitation), sign-out confirmation, the session-end
    // route, auth endpoints, Zitadel's proxied login UI and static assets.
    '/((?!login|password/|invite/|signed-out|session/end|api/auth|ui/v2/login|_next/static|_next/image|favicon.ico).*)',
  ],
};
