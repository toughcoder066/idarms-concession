import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exportPKCS8, generateKeyPair } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { HttpZitadelProvisioningClient } from './zitadel-client';

interface Call {
  method: string;
  path: string;
  body: any;
}

let keyPath: string;

beforeAll(async () => {
  const { privateKey } = await generateKeyPair('RS256', { extractable: true });
  keyPath = join(mkdtempSync(join(tmpdir(), 'zitadel-client-test-')), 'key.json');
  writeFileSync(keyPath, JSON.stringify({
    type: 'serviceaccount',
    keyId: 'test-key',
    userId: 'provisioner',
    key: await exportPKCS8(privateKey),
  }));
});

function harness(responses: Record<string, unknown> = {}) {
  const calls: Call[] = [];
  const fetchImpl = (async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname === '/oauth/v2/token') {
      return new Response(JSON.stringify({ access_token: 'provisioning-token', expires_in: 300 }));
    }
    calls.push({ method: init?.method ?? 'GET', path: url.pathname, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const body = responses[url.pathname] ?? {};
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  const client = new HttpZitadelProvisioningClient({
    baseUrl: 'http://localhost:8080',
    keyPath,
    portalUrl: 'https://portal.example.test/',
    fetchImpl,
  });
  return { client, calls };
}

const INVITE_TEMPLATE = 'https://portal.example.test/invite/accept?userId={{.UserID}}&code={{.Code}}&orgId={{.OrgID}}';

describe('staff invitations link to the portal, never to ZITADEL screens', () => {
  it('creates the user without a ZITADEL email, then sends a portal invite link', async () => {
    const { client, calls } = harness({ '/v2/users/human': { userId: 'user-9' } });

    const invited = await client.inviteHumanUser({
      orgId: 'org-a', email: 'ama@example.test', firstName: 'Ama', lastName: 'Mensah',
    });

    expect(invited).toEqual({ userId: 'user-9', userName: 'ama@example.test' });
    expect(calls[0]).toMatchObject({
      method: 'POST',
      path: '/v2/users/human',
      body: {
        username: 'ama@example.test',
        organization: { orgId: 'org-a' },
        profile: { givenName: 'Ama', familyName: 'Mensah' },
        email: { email: 'ama@example.test', returnCode: {} },
      },
    });
    expect(calls[1]).toEqual({
      method: 'POST',
      path: '/v2/users/user-9/invite_code',
      body: { sendCode: { urlTemplate: INVITE_TEMPLATE, applicationName: 'iDARMS' } },
    });
  });

  it('resends the invitation with the same portal link', async () => {
    const { client, calls } = harness();

    await client.resendInvitation({ orgId: 'org-a', userId: 'user-9' });

    expect(calls).toEqual([{
      method: 'POST',
      path: '/v2/users/user-9/invite_code',
      body: { sendCode: { urlTemplate: INVITE_TEMPLATE, applicationName: 'iDARMS' } },
    }]);
  });
});
