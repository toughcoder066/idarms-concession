export { auth as middleware } from '@/auth';

export const config = {
  matcher: [
    // Protect everything except the portal's own login pages (login, password
    // reset and change, invitation), sign-out confirmation, auth endpoints,
    // Zitadel's proxied login UI and static assets.
    '/((?!login|password/|invite/|signed-out|api/auth|ui/v2/login|_next/static|_next/image|favicon.ico).*)',
  ],
};
