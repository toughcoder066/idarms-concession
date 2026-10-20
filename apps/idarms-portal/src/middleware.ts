export { auth as middleware } from '@/auth';

export const config = {
  matcher: [
    // Protect everything except the login page, auth endpoints and static assets.
    '/((?!login|api/auth|_next/static|_next/image|favicon.ico).*)',
  ],
};
