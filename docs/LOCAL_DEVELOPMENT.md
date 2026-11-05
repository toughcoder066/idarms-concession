# Local development: running iDARMS and testing as different users

For developers working on this repo. Why sign-in and tenancy work the way they do is explained in `docs/HOW_IT_WORKS.md`. The formal rules are in ADR-0003 (decision 10) and ADR-0004.

Last updated 5 Nov 2026.

---

## 1. Three ways to run, from lightest to most real

| Mode | What it is | Needs ZITADEL? | Use it for |
|---|---|---|---|
| **Automated tests** | `pnpm test`. Routes run in-process with Fastify `inject()`, against a local test token issuer or header identity. | No | Almost everything: routes, permissions, tenancy, token checks. |
| **Header identity** | One service started with `AUTH_MODE=disabled` on `127.0.0.1`. You choose the user per request with `pnpm as-user`. | No | Trying a service by hand as different roles and assemblies. |
| **Full stack** | ZITADEL, all services with `AUTH_MODE=zitadel`, and the portal. You sign in for real. | Yes | The portal, sign-in, and anything that crosses services. |

HTTP on `localhost` works in all three. HTTPS is enforced only when `NODE_ENV=production`, for `ORG_CONTEXT_URL`, `CROIP_INTEGRATION_URL`, the portal's concessions URL and `PORTAL_URL`.

---

## 2. Full stack

```bash
pnpm install
pnpm db:up                 # PostgreSQL :5433 + RabbitMQ :5672
pnpm zitadel:up            # local ZITADEL on http://localhost:8080
pnpm zitadel:bootstrap     # concession org, iDARMS project, roles, apps, robots; writes .secrets/
pnpm prisma:generate
pnpm dev:all               # infra + 11 services + workers + portal (logs in .dev-logs/)
```

Open <http://localhost:3000> and sign in. The users that exist locally are the ones in ZITADEL. `concession-admin` is the Concession Admin; assembly users such as `ama-active-admin@idarms.local` are in their assembly orgs. Passwords are whatever you set; they are not stored in this repo.

`pnpm dev:all` also starts the workers. `croip-integration-service`'s upstream worker is wired to CROIP's real event gateway (see `docs/STATUS.md`). To run only the APIs, start each service with `pnpm --filter @idarms/<service> dev`.

**Every service and the portal must run the same auth code.** The org-registry lookup changed shape on 5 Nov 2026. A service on old code gets 401 from concessions-management, and its users get no tenant. After pulling auth changes, restart everything together.

### Check real ZITADEL authentication end to end

```bash
IDARMS_IT_LOGIN=ama-active-admin@idarms.local IDARMS_IT_PASSWORD='<that user's password>' pnpm test:auth:integration
```
(PowerShell: `$env:IDARMS_IT_LOGIN='...'; $env:IDARMS_IT_PASSWORD='...'; pnpm test:auth:integration`)

This signs in the way the portal does: ZITADEL's authorize endpoint, the Session API, then the code exchange. It gets a real access token and ID token and checks:
- concessions-management `/v1/org-context/me` answers for the user's own org;
- missing, garbage, tampered and ID tokens are refused;
- the old by-id route is gone;
- every running service accepts the access token and refuses the ID token;
- no response contains a token.

Services that aren't running are skipped. It never prints tokens or the password. Run it after changing anything in auth, ZITADEL or the bootstrap.

---

## 3. Header identity: test roles and assemblies without signing in

Header identity (`AUTH_MODE=disabled`) makes a service believe the `x-idarms-*` headers on each request instead of a token. Because anyone who can reach it could claim to be anyone, it is fenced in:
- **It refuses to start in production.**
- **It refuses to listen on anything but loopback** (`127.0.0.1`, `localhost`, `::1`), in every environment, test included.
- Services with `AUTH_MODE=zitadel` (the default) ignore these headers and answer 401 without a token.

Start one service in header mode next to the normal stack, on a spare port:

```bash
cd services/ratepayer-service
AUTH_MODE=disabled HOST=127.0.0.1 PORT=3920 pnpm dev
```
(PowerShell: `$env:AUTH_MODE='disabled'; $env:HOST='127.0.0.1'; $env:PORT='3920'; pnpm dev`)

Then call it as anyone:

```bash
pnpm as-user --list    # registered orgs from your local registry, and the role names

pnpm as-user --org accra --role FIELD_AGENT GET http://127.0.0.1:3920/v1/ratepayers
pnpm as-user --org ledzokuku --role ASSEMBLY_VIEWER GET http://127.0.0.1:3920/v1/ratepayers
pnpm as-user --org concession --role CONCESSION_SUPER_ADMIN GET http://127.0.0.1:3920/v1/ratepayers
pnpm as-user --org accra GET http://127.0.0.1:3920/v1/ratepayers          # no role: 403
pnpm as-user --org accra --role ASSEMBLY_ADMIN POST http://127.0.0.1:3920/v1/... '{"json":"body"}'
```

How the helper builds the request:
- `--org` takes an org id, or the start of the org's domain (`accra`, `ledzokuku`), or `concession` for the concession org.
- The concession and assembly come from your **local org registry**, exactly as a real token would resolve them, so nothing machine-specific is hard-coded.
- `--role` takes one or more roles, comma separated. Permissions come from the canonical role model (`packages/contracts`, run `pnpm --filter @idarms/contracts build` once).
- A persona with no role gets the placeholder permission `none`. An empty list would fall back to the service's default permissions, which would hide a missing-permission bug.
- The helper refuses any host that is not loopback.

Header mode skips token checks entirely, so it cannot show you authentication bugs. Use it for business behaviour; use the tests or the full stack for auth.

---

## 4. Automated tests: fixtures

Every service has two generated fixture files in `src/testing/`. They are copied from `scripts/shared-service-files/testing/` by `node scripts/sync-role-model.mjs`; edit the shared copy, then run the script.

### `personas.ts`: tenancy and users

- **`TEST_ORGS`**: two concessions.
  - Concession A has `concessionA` (the concession org), `assemblyA1` and `assemblyA2`.
  - Concession B has `concessionB` and `assemblyB1`.
- **`TEST_USERS`**:

  | User | Who they are |
  |---|---|
  | `concessionAdminA` | Concession Super Admin in concession A |
  | `assemblyAdminA1` | Assembly admin in assembly A1 |
  | `fieldAgentA1` | Field agent in assembly A1 |
  | `viewerA2` | Viewer in assembly A2 |
  | `assemblyAdminB1` | Assembly admin in concession B |
  | `noRoleA1` | Signed in, registered org, no iDARMS role |
  | `foreignRoleA1` | Holds a role only in another org, so has none in their home org |
  | `unregistered` | Home org not in the registry |
  | `noHomeOrg` | Token without a home-org claim |

- **`testOrgContext(orgId)`**: the registry answer for an org. Use it to mock `../lib/org-context`.
- **`devHeaders(user)`**: `x-idarms-*` headers for that user, for header-identity tests.

### `zitadel-test-issuer.ts`: real verification, no ZITADEL

`startTestIssuer()` makes a fresh RSA key pair and serves its public half as a JWKS on `127.0.0.1`, so the service's real `jwtVerify` path runs against it. It gives you:
- `accessToken(user, overrides?)`: shaped like a ZITADEL access token (`jti`, no ID-token claims).
- `idToken(user)`: same issuer and audience, with `at_hash`, `amr`, `auth_time` and `sid`. It must always be refused as a bearer token.
- `expiredAccessToken(user)` and `foreignKeyToken(user)`.
- `overrides`: `issuer`, `audience`, `expiresAt`, `notBefore`, `kid`, `claims`.

The keys live only as long as the test process. Never point a real service at the test issuer.

### Worked examples

| Test | Shows |
|---|---|
| `services/ratepayer-service/src/testing/fixtures.example.test.ts` | Signed tokens for several users, the registry mocked from personas, and checks on the tenant filter and on refusals. |
| `services/ratepayer-service/src/testing/dev-headers.example.test.ts` | Header identity with `devHeaders()`. |
| `services/concessions-management-service/src/modules/orgs/org-context-route.test.ts` | Every token failure case for `/v1/org-context/me`. |

The pattern for a token test:

```ts
vi.hoisted(() => {                        // config is read at import
  process.env.NODE_ENV = 'test';
  process.env.AUTH_MODE = 'zitadel';
  process.env.ZITADEL_ISSUER = 'http://issuer.test';       // TEST_ISSUER
  process.env.ZITADEL_AUDIENCE = 'idarms-audience';        // TEST_AUDIENCE
  process.env.ZITADEL_JWKS_URI = 'http://127.0.0.1:1/oauth/v2/keys';
  process.env.ZITADEL_PROJECT_ID = '111111111111111111';   // TEST_PROJECT_ID
  process.env.DATABASE_URL ??= 'postgresql://test:test@127.0.0.1:1/test';
});
vi.mock('../lib/org-context', async () => {
  const { testOrgContext } = await import('./personas.js');
  return { resolveOrgContext: vi.fn(async (orgId: string) => testOrgContext(orgId)) };
});
// beforeAll: issuer = await startTestIssuer(); config.zitadelJwksUri = issuer.jwksUri; build the app
// in a test: headers: { authorization: `Bearer ${await issuer.accessToken(TEST_USERS.fieldAgentA1)}` }
```

When you write a test token by hand, give it a `jti`: every service refuses tokens without one, because that is how it tells access tokens from ID tokens. Don't remove a check to make a test pass. Make the test token look like what ZITADEL really issues.

---

## 5. Quick reference

| I want to… | Do this |
|---|---|
| Run all unit and route tests | `pnpm test` |
| Check types | `pnpm typecheck` |
| Prove real ZITADEL sign-in still works | `pnpm test:auth:integration` (section 2) |
| Try a service as a field agent in Ledzokuku | Section 3: header-mode service plus `pnpm as-user --org ledzokuku --role FIELD_AGENT ...` |
| Add a test persona or org | Edit `scripts/shared-service-files/testing/personas.ts`, then `node scripts/sync-role-model.mjs` |
| See which orgs exist locally | `pnpm as-user --list` |
| Restart after an auth change | Stop everything, then start all services and the portal together |
