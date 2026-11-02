import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { decode } from 'next-auth/jwt';
import { isPreviewPersona, type PreviewPersonaKey } from '@idarms/contracts';

export const PREVIEW_COOKIE = 'idarms_preview';
const PREVIEW_TTL_SECONDS = 60 * 60;
const SESSION_COOKIE_NAMES = [
  'authjs.session-token',
  '__Secure-authjs.session-token',
  'next-auth.session-token',
  '__Secure-next-auth.session-token',
];

function secret(): string {
  return process.env.AUTH_SECRET || 'local-preview-only-secret';
}

function signature(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

function signaturesMatch(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function sessionCookie(
  store: Awaited<ReturnType<typeof cookies>>,
): { name: string; token: string } | null {
  for (const name of SESSION_COOKIE_NAMES) {
    const direct = store.get(name)?.value;
    if (direct) return { name, token: direct };

    const prefix = `${name}.`;
    const chunks = store.getAll()
      .filter((cookie) => cookie.name.startsWith(prefix))
      .sort((left, right) => (
        Number(left.name.slice(prefix.length)) - Number(right.name.slice(prefix.length))
      ));
    if (chunks.length > 0) {
      return { name, token: chunks.map((cookie) => cookie.value).join('') };
    }
  }
  return null;
}

export interface PreviewSession {
  actorId: string;
  roles: string[];
  name?: string;
  email?: string;
  accessToken?: string;
}

/**
 * Reads the existing NextAuth JWT session cookie. This is a local decrypt only;
 * it never refreshes a token, calls ZITADEL, or changes the session.
 */
async function decodeSession(
  store: Awaited<ReturnType<typeof cookies>>,
): Promise<PreviewSession | null> {
  const cookie = sessionCookie(store);
  if (!cookie) return null;
  try {
    const decoded = await decode({
      token: cookie.token,
      secret: secret(),
      salt: cookie.name,
    });
    if (!decoded) return null;
    const expiresAt = typeof decoded.expiresAt === 'number'
      ? decoded.expiresAt
      : typeof decoded.exp === 'number' ? decoded.exp : null;
    if (expiresAt !== null && expiresAt < Math.floor(Date.now() / 1000)) return null;
    const actorId = typeof decoded?.userId === 'string'
      ? decoded.userId
      : typeof decoded?.sub === 'string' ? decoded.sub : null;
    if (!actorId) return null;
    return {
      actorId,
      roles: Array.isArray(decoded.roles)
        ? decoded.roles.filter((role): role is string => typeof role === 'string')
        : [],
      name: typeof decoded.name === 'string' ? decoded.name : undefined,
      email: typeof decoded.email === 'string' ? decoded.email : undefined,
      accessToken: typeof decoded.accessToken === 'string' ? decoded.accessToken : undefined,
    };
  } catch {
    return null;
  }
}

export async function readPreviewSession(): Promise<PreviewSession | null> {
  const store = await cookies();
  return decodeSession(store);
}

async function currentSessionActorId(
  store: Awaited<ReturnType<typeof cookies>>,
): Promise<string | null> {
  return (await decodeSession(store))?.actorId ?? null;
}

export async function setPreviewCookie(
  persona: PreviewPersonaKey,
  actorId: string,
): Promise<void> {
  const expiresAt = Math.floor(Date.now() / 1000) + PREVIEW_TTL_SECONDS;
  const payload = `${persona}.${expiresAt}.${actorId}`;
  const store = await cookies();
  store.set(PREVIEW_COOKIE, `${payload}.${signature(payload)}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: PREVIEW_TTL_SECONDS,
  });
}

export async function readPreviewPersona(): Promise<PreviewPersonaKey | null> {
  const store = await cookies();
  const token = store.get(PREVIEW_COOKIE)?.value;
  if (!token) return null;

  const [persona, expiresAt, actorId, suppliedSignature] = token.split('.');
  if (!persona || !expiresAt || !actorId || !suppliedSignature) return null;
  if (!isPreviewPersona(persona)) return null;

  const expiry = Number(expiresAt);
  if (!Number.isFinite(expiry) || expiry < Math.floor(Date.now() / 1000)) return null;
  if (!signaturesMatch(signature(`${persona}.${expiresAt}.${actorId}`), suppliedSignature)) {
    return null;
  }

  const currentActorId = await currentSessionActorId(store);
  if (!currentActorId || currentActorId !== actorId) return null;

  return persona;
}

export async function clearPreviewCookie(): Promise<void> {
  const store = await cookies();
  store.delete(PREVIEW_COOKIE);
}


