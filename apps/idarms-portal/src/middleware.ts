export { auth as middleware } from '@/auth';

export const config = {
  matcher: [
    // Protect everything except login, sign-out confirmation, auth endpoints,
    // Zitadel's proxied login UI and static assets.
    '/((?!login|signed-out|api/auth|ui/v2/login|_next/static|_next/image|favicon.ico).*)',
  ],
};
