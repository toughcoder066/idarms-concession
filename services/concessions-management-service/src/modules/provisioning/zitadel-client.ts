import { createPrivateKey } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { SignJWT, importPKCS8, type KeyLike } from 'jose';

export interface ZitadelProvisioningClientOptions {
  baseUrl: string;
  keyPath?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  /** Invitation links point here (`/invite/accept`), never at ZITADEL's screens (ADR-0004). */
  portalUrl?: string;
}

export interface ZitadelOrganization {
  orgId: string;
  name: string;
  primaryDomain?: string;
}

export interface ZitadelUserGrant {
  id: string;
  userId: string;
  userName?: string;
  roleKeys: string[];
  orgId: string;
  projectId: string;
}

export interface ZitadelInvitedUser {
  userId: string;
  userName: string;
}

export interface ZitadelHumanUser {
  userId: string;
  userName: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  state: string;
  createdAt: string;
}

export interface ZitadelProjectUserGrant {
  id: string;
  userId: string;
  userName?: string;
  roleKeys: string[];
  state?: string;
}

export interface ZitadelSessionInfo {
  id: string;
  userId?: string;
  creationDate: string;
  changeDate: string;
}

export interface ZitadelStaffClient extends ZitadelProvisioningClient {
  listHumanUsers(orgId: string): Promise<ZitadelHumanUser[]>;
  getUser(orgId: string, userId: string): Promise<ZitadelHumanUser | null>;
  listProjectUserGrants(input: {
    orgId: string;
    projectId: string;
  }): Promise<ZitadelProjectUserGrant[]>;
  setUserGrantRoles(input: {
    orgId: string;
    userId: string;
    projectId: string;
    roleKeys: readonly string[];
  }): Promise<void>;
  deactivateUser(input: { orgId: string; userId: string }): Promise<void>;
  reactivateUser(input: { orgId: string; userId: string }): Promise<void>;
  listUserSessions(input: { orgId: string; userId: string }): Promise<ZitadelSessionInfo[]>;
  listOrgSessions(orgId: string): Promise<ZitadelSessionInfo[]>;
  deleteSession(input: { orgId: string; sessionId: string }): Promise<void>;
  revokeUserSessions(input: { orgId: string; userId: string }): Promise<number>;
  resendInvitation(input: { orgId: string; userId: string }): Promise<void>;
}

export interface ZitadelProvisioningClient {
  createOrganization(name: string): Promise<ZitadelOrganization>;
  getOrganization(orgId: string): Promise<ZitadelOrganization | null>;
  findOrganizationByName(name: string): Promise<ZitadelOrganization | null>;
  deleteOrganization(orgId: string): Promise<void>;
  /** Runs in the org that owns the iDARMS project: ZITADEL infrastructure, never a tenant. */
  ensureProjectGrant(input: {
    projectOwnerOrgId: string;
    projectId: string;
    grantedOrgId: string;
    roleKeys: readonly string[];
  }): Promise<string>;
  listUserGrants(input: {
    orgId: string;
    userId: string;
    projectId: string;
  }): Promise<ZitadelUserGrant[]>;
  addUserGrant(input: {
    orgId: string;
    userId: string;
    projectId: string;
    roleKeys: readonly string[];
  }): Promise<void>;
  /** Users holding a role through grants owned by one org (the concession org for super admins). */
  listProjectRoleHolders(input: {
    orgId: string;
    projectId: string;
    role: string;
  }): Promise<ZitadelUserGrant[]>;
  inviteHumanUser(input: {
    orgId: string;
    email: string;
    firstName: string;
    lastName: string;
    phone?: string;
  }): Promise<ZitadelInvitedUser>;
  findUserByEmail(input: {
    orgId: string;
    email: string;
  }): Promise<ZitadelInvitedUser | null>;
}

export class ZitadelProvisioningError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string | number,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ZitadelProvisioningError';
  }
}

export function isZitadelNotFound(error: unknown): boolean {
  return error instanceof ZitadelProvisioningError && error.status === 404;
}

/** Scope lock: provisioning must never call a remote ZITADEL instance. */
export function assertLocalZitadelUrl(value: string): URL {
  const url = new URL(value);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error(`Refusing non-local ZITADEL URL "${url.hostname}" (scope lock: local-only).`);
  }
  return url;
}

interface MachineKey {
  userId: string;
  keyId: string;
  key: string;
}

interface CachedToken {
  value: string;
  expiresAt: number;
}

export class HttpZitadelProvisioningClient implements ZitadelStaffClient {
  private readonly baseUrl: string;
  private readonly keyPath?: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly portalUrl: string;
  private machineKey?: MachineKey;
  private privateKey?: KeyLike;
  private cachedToken?: CachedToken;

  constructor(options: ZitadelProvisioningClientOptions) {
    this.baseUrl = assertLocalZitadelUrl(options.baseUrl).toString().replace(/\/$/, '');
    this.keyPath = options.keyPath;
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.portalUrl = (options.portalUrl ?? 'http://localhost:3000').replace(/\/+$/, '');
  }

  /** ZITADEL emails the invite code with a link to the portal's own accept page. */
  private inviteCodeRequest() {
    return {
      sendCode: {
        urlTemplate: `${this.portalUrl}/invite/accept?userId={{.UserID}}&code={{.Code}}&orgId={{.OrgID}}`,
        applicationName: 'iDARMS',
      },
    };
  }

  async createOrganization(name: string): Promise<ZitadelOrganization> {
    const body = await this.request('POST', '/v2/organizations', { body: { name } });
    const orgId = String(body?.organizationId ?? '');
    if (!orgId) {
      throw new ZitadelProvisioningError('ZITADEL did not return an organization ID.', 502, undefined, body);
    }
    const org = await this.getOrganization(orgId).catch(() => null);
    return { orgId, name, primaryDomain: org?.primaryDomain };
  }

  async getOrganization(orgId: string): Promise<ZitadelOrganization | null> {
    try {
      const body = await this.request('GET', '/management/v1/orgs/me', { orgId });
      const org = body?.org;
      if (!org?.id) return null;
      return {
        orgId: String(org.id),
        name: String(org.name ?? ''),
        primaryDomain: typeof org.primaryDomain === 'string' ? org.primaryDomain : undefined,
      };
    } catch (error) {
      if (isZitadelNotFound(error)) return null;
      throw error;
    }
  }

  async findOrganizationByName(name: string): Promise<ZitadelOrganization | null> {
    const body = await this.request('POST', '/admin/v1/orgs/_search', {
      body: {
        query: { limit: 100, offset: 0 },
        queries: [{ nameQuery: { name } }],
      },
    });
    const match = (body?.result ?? []).find((org: { name?: string }) => org.name === name);
    if (!match?.id) return null;
    return {
      orgId: String(match.id),
      name: String(match.name ?? name),
      primaryDomain: typeof match.primaryDomain === 'string' ? match.primaryDomain : undefined,
    };
  }

  async deleteOrganization(orgId: string): Promise<void> {
    try {
      await this.request('DELETE', `/v2/organizations/${encodeURIComponent(orgId)}`);
    } catch (error) {
      if (isZitadelNotFound(error)) return;
      throw error;
    }
  }

  async ensureProjectGrant(input: {
    projectOwnerOrgId: string;
    projectId: string;
    grantedOrgId: string;
    roleKeys: readonly string[];
  }): Promise<string> {
    const grants = await this.request(
      'POST',
      `/management/v1/projects/${encodeURIComponent(input.projectId)}/grants/_search`,
      {
        orgId: input.projectOwnerOrgId,
        body: { query: { limit: 200, offset: 0 }, queries: [] },
      },
    );
    const existing = (grants?.result ?? []).find(
      (grant: { grantedOrgId?: string }) => grant.grantedOrgId === input.grantedOrgId,
    );

    if (!existing) {
      const created = await this.request(
        'POST',
        `/management/v1/projects/${encodeURIComponent(input.projectId)}/grants`,
        {
          orgId: input.projectOwnerOrgId,
          body: {
            projectId: input.projectId,
            grantedOrgId: input.grantedOrgId,
            roleKeys: [...input.roleKeys],
          },
        },
      );
      const grantId = String(created?.grantId ?? '');
      if (!grantId) {
        throw new ZitadelProvisioningError('ZITADEL did not return a project grant ID.', 502, undefined, created);
      }
      return grantId;
    }

    const existingRoles: string[] = Array.isArray(existing.grantedRoleKeys) ? existing.grantedRoleKeys : [];
    const mergedRoles = [...new Set([...existingRoles, ...input.roleKeys])];
    if (mergedRoles.length !== existingRoles.length) {
      await this.request(
        'PUT',
        `/management/v1/projects/${encodeURIComponent(input.projectId)}/grants/${encodeURIComponent(String(existing.grantId))}`,
        {
          orgId: input.projectOwnerOrgId,
          body: {
            projectId: input.projectId,
            grantedOrgId: input.grantedOrgId,
            roleKeys: mergedRoles,
          },
        },
      );
    }
    return String(existing.grantId);
  }

  async listUserGrants(input: {
    orgId: string;
    userId: string;
    projectId: string;
  }): Promise<ZitadelUserGrant[]> {
    const body = await this.request('POST', '/management/v1/users/grants/_search', {
      orgId: input.orgId,
      body: {
        query: { limit: 200, offset: 0 },
        queries: [
          { userIdQuery: { userId: input.userId } },
          { projectIdQuery: { projectId: input.projectId } },
        ],
      },
    });
    return (body?.result ?? []).map(mapUserGrant);
  }

  async addUserGrant(input: {
    orgId: string;
    userId: string;
    projectId: string;
    roleKeys: readonly string[];
  }): Promise<void> {
    const existing = await this.listUserGrants({
      orgId: input.orgId,
      userId: input.userId,
      projectId: input.projectId,
    });

    if (existing.length > 0) {
      const grant = existing[0];
      const missing = input.roleKeys.filter((role) => !grant.roleKeys.includes(role));
      if (missing.length === 0) return;
      const mergedRoles = [...new Set([...grant.roleKeys, ...input.roleKeys])];
      await this.request(
        'PUT',
        `/management/v1/users/${encodeURIComponent(input.userId)}/grants/${encodeURIComponent(grant.id)}`,
        {
          orgId: input.orgId,
          body: { userId: input.userId, projectId: input.projectId, roleKeys: mergedRoles },
        },
      );
      return;
    }

    try {
      await this.request('POST', `/management/v1/users/${encodeURIComponent(input.userId)}/grants`, {
        orgId: input.orgId,
        body: { userId: input.userId, projectId: input.projectId, roleKeys: [...input.roleKeys] },
      });
    } catch (error) {
      if (error instanceof ZitadelProvisioningError && error.status === 409) return;
      throw error;
    }
  }

  async listProjectRoleHolders(input: {
    orgId: string;
    projectId: string;
    role: string;
  }): Promise<ZitadelUserGrant[]> {
    const all: ZitadelUserGrant[] = [];
    const limit = 500;
    let offset = 0;
    let total = Number.POSITIVE_INFINITY;

    while (all.length < total) {
      const body = await this.request('POST', '/management/v1/users/grants/_search', {
        orgId: input.orgId,
        body: {
          query: { limit, offset },
          queries: [{ projectIdQuery: { projectId: input.projectId } }],
        },
      });
      const page = (body?.result ?? []).map(mapUserGrant);
      all.push(...page);
      total = Number(body?.details?.totalResult ?? all.length);
      if (page.length < limit) break;
      offset += limit;
    }

    const seen = new Set<string>();
    return all.filter((grant) => {
      if (!grant.roleKeys.includes(input.role) || seen.has(grant.userId)) return false;
      seen.add(grant.userId);
      return true;
    });
  }

  async inviteHumanUser(input: {
    orgId: string;
    email: string;
    firstName: string;
    lastName: string;
    phone?: string;
  }): Promise<ZitadelInvitedUser> {
    try {
      // returnCode keeps ZITADEL from sending its own verification email; the
      // invite code below is the only email the new staff member receives.
      const body = await this.request('POST', '/v2/users/human', {
        orgId: input.orgId,
        body: {
          username: input.email,
          organization: { orgId: input.orgId },
          profile: { givenName: input.firstName, familyName: input.lastName },
          email: { email: input.email, returnCode: {} },
          ...(input.phone ? { phone: { phone: input.phone, returnCode: {} } } : {}),
        },
      });
      const userId = String(body?.userId ?? '');
      if (!userId) throw new ZitadelProvisioningError('ZITADEL did not return a user ID.', 502, undefined, body);
      await this.request('POST', `/v2/users/${encodeURIComponent(userId)}/invite_code`, {
        orgId: input.orgId,
        body: this.inviteCodeRequest(),
      });
      return { userId, userName: input.email };
    } catch (error) {
      if (error instanceof ZitadelProvisioningError && error.status === 409) {
        const existing = await this.findUserByEmail({ orgId: input.orgId, email: input.email });
        if (existing) return existing;
      }
      throw error;
    }
  }

  async findUserByEmail(input: { orgId: string; email: string }): Promise<ZitadelInvitedUser | null> {
    const byName = await this.request('POST', '/management/v1/users/_search', {
      orgId: input.orgId,
      body: {
        query: { limit: 10, offset: 0 },
        queries: [{ userNameQuery: { userName: input.email } }],
      },
    });
    const direct = (byName?.result ?? []).find(
      (user: { userName?: string }) => user.userName?.toLowerCase() === input.email.toLowerCase(),
    );
    if (direct?.id) {
      return { userId: String(direct.id), userName: String(direct.userName ?? input.email) };
    }

    const all = await this.request('POST', '/management/v1/users/_search', {
      orgId: input.orgId,
      body: { query: { limit: 500, offset: 0 } },
    });
    const match = (all?.result ?? []).find(
      (user: { userName?: string; human?: { email?: { email?: string } } }) =>
        user.userName?.toLowerCase() === input.email.toLowerCase()
        || user.human?.email?.email?.toLowerCase() === input.email.toLowerCase(),
    );
    return match?.id
      ? { userId: String(match.id), userName: String(match.userName ?? input.email) }
      : null;
  }

  async listHumanUsers(orgId: string): Promise<ZitadelHumanUser[]> {
    const users: ZitadelHumanUser[] = [];
    const limit = 500;
    let offset = 0;
    let total = Number.POSITIVE_INFINITY;

    while (users.length < total) {
      const body = await this.request('POST', '/management/v1/users/_search', {
        orgId,
        body: { query: { limit, offset }, queries: [] },
      });
      const page = (body?.result ?? []).filter((user: any) => user.human).map(mapHumanUser);
      users.push(...page);
      total = Number(body?.details?.totalResult ?? users.length);
      const rawPageLength = Array.isArray(body?.result) ? body.result.length : 0;
      if (rawPageLength < limit) break;
      offset += limit;
    }
    return users;
  }

  async getUser(orgId: string, userId: string): Promise<ZitadelHumanUser | null> {
    try {
      const body = await this.request('GET', `/management/v1/users/${encodeURIComponent(userId)}`, { orgId });
      if (!body?.user?.human) return null;
      return mapHumanUser(body.user);
    } catch (error) {
      if (isZitadelNotFound(error)) return null;
      throw error;
    }
  }

  async listProjectUserGrants(input: {
    orgId: string;
    projectId: string;
  }): Promise<ZitadelProjectUserGrant[]> {
    const grants: ZitadelProjectUserGrant[] = [];
    const limit = 500;
    let offset = 0;
    let total = Number.POSITIVE_INFINITY;

    while (grants.length < total) {
      const body = await this.request('POST', '/management/v1/users/grants/_search', {
        orgId: input.orgId,
        body: {
          query: { limit, offset },
          queries: [{ projectIdQuery: { projectId: input.projectId } }],
        },
      });
      const page: ZitadelProjectUserGrant[] = (body?.result ?? []).map((grant: any) => ({
        id: String(grant.id ?? ''),
        userId: String(grant.userId ?? ''),
        userName: grant.userName ? String(grant.userName) : undefined,
        roleKeys: Array.isArray(grant.roleKeys) ? grant.roleKeys : [],
        state: grant.state ? String(grant.state) : undefined,
      }));
      grants.push(...page);
      total = Number(body?.details?.totalResult ?? grants.length);
      const rawPageLength = Array.isArray(body?.result) ? body.result.length : 0;
      if (rawPageLength < limit) break;
      offset += limit;
    }
    return grants;
  }

  async setUserGrantRoles(input: {
    orgId: string;
    userId: string;
    projectId: string;
    roleKeys: readonly string[];
  }): Promise<void> {
    const existing = await this.listUserGrants({
      orgId: input.orgId,
      userId: input.userId,
      projectId: input.projectId,
    });

    if (existing.length > 0) {
      await this.request(
        'PUT',
        `/management/v1/users/${encodeURIComponent(input.userId)}/grants/${encodeURIComponent(existing[0].id)}`,
        {
          orgId: input.orgId,
          body: {
            userId: input.userId,
            projectId: input.projectId,
            roleKeys: [...input.roleKeys],
          },
        },
      );
      return;
    }

    await this.request('POST', `/management/v1/users/${encodeURIComponent(input.userId)}/grants`, {
      orgId: input.orgId,
      body: {
        userId: input.userId,
        projectId: input.projectId,
        roleKeys: [...input.roleKeys],
      },
    });
  }

  async deactivateUser(input: { orgId: string; userId: string }): Promise<void> {
    await this.request('POST', `/v2/users/${encodeURIComponent(input.userId)}/deactivate`, {
      orgId: input.orgId,
      body: {},
    });
  }

  async reactivateUser(input: { orgId: string; userId: string }): Promise<void> {
    await this.request('POST', `/v2/users/${encodeURIComponent(input.userId)}/reactivate`, {
      orgId: input.orgId,
      body: {},
    });
  }

  async listUserSessions(input: { orgId: string; userId: string }): Promise<ZitadelSessionInfo[]> {
    return this.searchSessions(input.orgId, [{ userIdQuery: { id: input.userId } }]);
  }

  async listOrgSessions(orgId: string): Promise<ZitadelSessionInfo[]> {
    return this.searchSessions(orgId, []);
  }

  async deleteSession(input: { orgId: string; sessionId: string }): Promise<void> {
    try {
      await this.request('DELETE', `/v2/sessions/${encodeURIComponent(input.sessionId)}`, {
        orgId: input.orgId,
      });
    } catch (error) {
      if (isZitadelNotFound(error)) return;
      throw error;
    }
  }

  async revokeUserSessions(input: { orgId: string; userId: string }): Promise<number> {
    const sessions = await this.listUserSessions(input);
    for (const session of sessions) {
      await this.deleteSession({ orgId: input.orgId, sessionId: session.id });
    }
    return sessions.length;
  }

  async resendInvitation(input: { orgId: string; userId: string }): Promise<void> {
    await this.request('POST', `/v2/users/${encodeURIComponent(input.userId)}/invite_code`, {
      orgId: input.orgId,
      body: this.inviteCodeRequest(),
    });
  }

  private async searchSessions(
    orgId: string,
    queries: unknown[],
  ): Promise<ZitadelSessionInfo[]> {
    const sessions: ZitadelSessionInfo[] = [];
    const limit = 500;
    let offset = 0;
    let total = Number.POSITIVE_INFINITY;

    while (sessions.length < total) {
      const body = await this.request('POST', '/v2/sessions/search', {
        orgId,
        body: { query: { limit, offset }, queries },
      });
      const page: ZitadelSessionInfo[] = (body?.sessions ?? []).map((session: any) => ({
        id: String(session.id ?? ''),
        userId: session.factors?.user?.id ? String(session.factors.user.id) : undefined,
        creationDate: String(session.creationDate ?? ''),
        changeDate: String(session.changeDate ?? session.creationDate ?? ''),
      }));
      sessions.push(...page);
      total = Number(body?.details?.totalResult ?? sessions.length);
      const rawPageLength = Array.isArray(body?.sessions) ? body.sessions.length : 0;
      if (rawPageLength < limit) break;
      offset += limit;
    }
    return sessions;
  }

  private loadMachineKey(): MachineKey {
    if (this.machineKey) return this.machineKey;
    if (!this.keyPath) {
      throw new Error(
        'ZITADEL_PROVISIONING_KEY_PATH is not configured. Run `pnpm zitadel:export-key` for the local instance.',
      );
    }
    const path = isAbsolute(this.keyPath) ? this.keyPath : resolve(process.cwd(), this.keyPath);
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<MachineKey>;
    if (!parsed.userId || !parsed.keyId || !parsed.key) {
      throw new Error(`Invalid ZITADEL machine key at ${path}.`);
    }
    this.machineKey = { userId: parsed.userId, keyId: parsed.keyId, key: parsed.key };
    return this.machineKey;
  }

  private async loadPrivateKey(): Promise<{ key: MachineKey; privateKey: KeyLike }> {
    const key = this.loadMachineKey();
    if (!this.privateKey) {
      const pkcs8 = createPrivateKey({ key: key.key, format: 'pem' }).export({
        type: 'pkcs8',
        format: 'pem',
      });
      this.privateKey = await importPKCS8(String(pkcs8), 'RS256');
    }
    return { key, privateKey: this.privateKey };
  }

  private async accessToken(): Promise<string> {
    if (this.cachedToken && this.cachedToken.expiresAt > Date.now()) return this.cachedToken.value;

    const { key, privateKey } = await this.loadPrivateKey();
    const now = Math.floor(Date.now() / 1000);
    const assertion = await new SignJWT({})
      .setProtectedHeader({ alg: 'RS256', kid: key.keyId })
      .setIssuer(key.userId)
      .setSubject(key.userId)
      .setAudience(this.baseUrl)
      .setIssuedAt(now)
      .setExpirationTime(now + 300)
      .sign(privateKey);

    const response = await this.fetchImpl(`${this.baseUrl}/oauth/v2/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
        scope: 'openid urn:zitadel:iam:org:project:id:zitadel:aud',
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const body = await parseBody(response);
    if (!response.ok) {
      throw new ZitadelProvisioningError(
        errorMessage(body, 'ZITADEL token exchange failed.'),
        response.status,
        body?.code,
        body,
      );
    }
    const value = String(body?.access_token ?? '');
    if (!value) throw new ZitadelProvisioningError('ZITADEL returned an empty access token.', 502, undefined, body);
    const expiresIn = Number(body?.expires_in ?? 300);
    this.cachedToken = {
      value,
      expiresAt: Date.now() + Math.max(30, expiresIn - 30) * 1000,
    };
    return value;
  }

  private async request(
    method: string,
    path: string,
    options: { orgId?: string; body?: unknown } = {},
  ): Promise<any> {
    assertLocalZitadelUrl(this.baseUrl);
    const token = await this.accessToken();
    const headers: Record<string, string> = { authorization: `Bearer ${token}` };
    if (options.body !== undefined) headers['content-type'] = 'application/json';
    if (options.orgId) headers['x-zitadel-orgid'] = options.orgId;

    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers,
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const body = await parseBody(response);
    if (!response.ok) {
      throw new ZitadelProvisioningError(
        errorMessage(body, `ZITADEL request ${method} ${path} failed.`),
        response.status,
        body?.code,
        body,
      );
    }
    return body;
  }
}

export function createZitadelProvisioningClient(
  options: ZitadelProvisioningClientOptions,
): ZitadelStaffClient {
  return new HttpZitadelProvisioningClient(options);
}

function mapHumanUser(user: {
  id?: string;
  userName?: string;
  state?: string;
  details?: { creationDate?: string };
  human?: {
    profile?: { firstName?: string; lastName?: string; displayName?: string };
    email?: { email?: string };
  };
}): ZitadelHumanUser {
  return {
    userId: String(user.id ?? ''),
    userName: String(user.userName ?? ''),
    email: user.human?.email?.email ? String(user.human.email.email) : undefined,
    firstName: user.human?.profile?.firstName ? String(user.human.profile.firstName) : undefined,
    lastName: user.human?.profile?.lastName ? String(user.human.profile.lastName) : undefined,
    displayName: user.human?.profile?.displayName ? String(user.human.profile.displayName) : undefined,
    state: String(user.state ?? ''),
    createdAt: String(user.details?.creationDate ?? ''),
  };
}

function mapUserGrant(grant: {
  id?: string;
  userId?: string;
  userName?: string;
  roleKeys?: string[];
  orgId?: string;
  projectId?: string;
}): ZitadelUserGrant {
  return {
    id: String(grant.id ?? ''),
    userId: String(grant.userId ?? ''),
    userName: grant.userName ? String(grant.userName) : undefined,
    roleKeys: Array.isArray(grant.roleKeys) ? grant.roleKeys : [],
    orgId: String(grant.orgId ?? ''),
    projectId: String(grant.projectId ?? ''),
  };
}

async function parseBody(response: Response): Promise<any> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function errorMessage(body: any, fallback: string): string {
  if (body && typeof body === 'object' && typeof body.message === 'string') return body.message;
  if (typeof body === 'string' && body.trim()) return body.slice(0, 500);
  return fallback;
}
