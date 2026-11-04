import { NextResponse, type NextRequest } from 'next/server';
import { endPortalSession } from '@/lib/zitadel-login/sign-out';
import { portalUrl } from '@/lib/zitadel-login/request';

const REASONS = new Set(['no_access', 'session_ended']);

/**
 * Where an unusable session is sent (expired refresh, no iDARMS role, or a
 * sign-in refused for having no role). It signs out everywhere, like the
 * sign-out button, then shows the login page with the reason. Ending a
 * session is the only thing it can do, so a forged link can only sign a user out.
 */
export async function GET(request: NextRequest) {
  await endPortalSession();
  const reason = request.nextUrl.searchParams.get('reason');
  const target = new URL('/login', portalUrl());
  target.search = REASONS.has(reason ?? '') ? reason! : 'session_ended';
  return NextResponse.redirect(target, { headers: { 'cache-control': 'no-store' } });
}
