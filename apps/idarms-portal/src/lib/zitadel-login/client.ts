import 'server-only';
import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';

/**
 * Server-side client for ZITADEL's login APIs (Session, OIDC and User v2),
 * authenticated as the portal's IAM_LOGIN_CLIENT machine user (ADR-0004).
 * That credential can create sessions and set passwords for any user, so it
 * lives only on the portal server and never reaches the browser or the logs.
 */

export interface MachineKey {
  keyId: string;
  userId: string;
  key: string;
}

export interface LoginApi {
  call<T = any>(method: string, path: string, body?: unknown): Promise<T>;
}

export class ZitadelApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: number | undefined,
    message: string,
  ) {
    super(message);
    this.name = 'ZitadelApiError';
  }
}

export interface LoginClientOptions {
  issuer: string;
  machineKey: MachineKey;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  now?: () => number;
}

export class ZitadelLoginClient implements LoginApi {
  private readonly issuer: string;
  private readonly machineKey: MachineKey;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly now: () => number;
  private token?: { value: string; expiresAt: number };
  private pending?: Promise<string>;

  constructor(options: LoginClientOptions) {
    this.issuer = options.issuer.replace(/\/+$/, '');
    this.machineKey = options.machineKey;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.now = options.now ?? Date.now;
  }

  async call<T = any>(method: string, path: string, body?: unknown): Promise<T> {
    const token = await this.accessToken();
    const response = await this.fetchImpl(`${this.issuer}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/json',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const text = await response.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (!response.ok) {
      throw new ZitadelApiError(
        response.status,
        typeof json?.code === 'number' ? json.code : undefined,
        `ZITADEL ${method} ${path.split('?')[0]} failed with HTTP ${response.status}`,
      );
    }
    return json as T;
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > this.now()) return this.token.value;
    // One token request at a time; concurrent sign-ins share it.
    this.pending ??= this.fetchToken().finally(() => {
      this.pending = undefined;
    });
    return this.pending;
  }

  private async fetchToken(): Promise<string> {
    const response = await this.fetchImpl(`${this.issuer}/oauth/v2/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: this.assertion(),
        scope: 'openid urn:zitadel:iam:org:project:id:zitadel:aud',
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const body = await response.json().catch(() => null) as { access_token?: string; expires_in?: number } | null;
    if (!response.ok || !body?.access_token) {
      throw new ZitadelApiError(response.status, undefined, `ZITADEL login client token request failed with HTTP ${response.status}`);
    }
    const lifetimeMs = Math.max(30, (body.expires_in ?? 300) - 30) * 1000;
    this.token = { value: body.access_token, expiresAt: this.now() + lifetimeMs };
    return body.access_token;
  }

  private assertion(): string {
    const nowSeconds = Math.floor(this.now() / 1000);
    const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const header = encode({ alg: 'RS256', kid: this.machineKey.keyId });
    const payload = encode({
      iss: this.machineKey.userId,
      sub: this.machineKey.userId,
      aud: this.issuer,
      iat: nowSeconds,
      exp: nowSeconds + 300,
    });
    const signer = createSign('RSA-SHA256');
    signer.update(`${header}.${payload}`);
    return `${header}.${payload}.${signer.sign(this.machineKey.key).toString('base64url')}`;
  }
}

let shared: ZitadelLoginClient | undefined;

/** The portal's login client, configured from ZITADEL_ISSUER and ZITADEL_LOGIN_CLIENT_KEY_PATH. */
export function loginClient(): ZitadelLoginClient {
  if (shared) return shared;
  const issuer = process.env.ZITADEL_ISSUER;
  const keyPath = process.env.ZITADEL_LOGIN_CLIENT_KEY_PATH;
  if (!issuer || !keyPath) {
    throw new Error('ZITADEL_ISSUER and ZITADEL_LOGIN_CLIENT_KEY_PATH must be set for the portal login (run pnpm zitadel:login-client)');
  }
  const machineKey = JSON.parse(readFileSync(keyPath, 'utf8')) as MachineKey;
  if (!machineKey.keyId || !machineKey.userId || !machineKey.key) {
    throw new Error('ZITADEL_LOGIN_CLIENT_KEY_PATH does not hold a ZITADEL machine key');
  }
  shared = new ZitadelLoginClient({ issuer, machineKey });
  return shared;
}
