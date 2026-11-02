# iDARMS Platform

Decoupled Concessionaire Microservice Ecosystem & CROIP Sync Bridge.

iDARMS is the **local operational backend** for a concessionaire. It is a replaceable edge
terminal: CROIP (Apex) is the permanent system of record, and iDARMS holds a read-only replica
of CROIP master data plus local operational data (field verifications, billing, payments).

Full architecture and build rules live in
[docs/IDARMS_MASTER_SPEC.md](docs/IDARMS_MASTER_SPEC.md). The per-service engineering
baseline is documented in [docs/golden_template.md](docs/golden_template.md).

## Key rules

- **Microservices only** — exactly 1 frontend (`apps/idarms-portal`) and 11 backend services
  (`services/*`). No monolith.
- **Database isolation** — every service owns its own PostgreSQL database. Cross-service SQL
  joins are forbidden.
- **Event-driven** — services communicate only via RabbitMQ (`idarms.events` exchange) using
  Transactional Outbox + Inbox patterns.
- **Multi-assembly tenancy** — every domain table carries `concessionId` and `assemblyId`
  resolved from the ZITADEL organization/role claims through the org registry.
- **CQRS routing** — the Next.js frontend performs *master-data writes* (ratepayers and
  properties only) directly against the CROIP Apex API, because CROIP's registries are the
  single source of truth for those entities. *Reads / local operations* hit the local iDARMS
  services, and every other local operational event flows up to CROIP via the outbox →
  RabbitMQ bridge for oversight.

## Repository layout

```
idarms-platform/
├── apps/
│   └── idarms-portal/              # Next.js 16 Admin & Field Agent UI
├── services/                       # 11 independent Fastify microservices
│   ├── ratepayer-service/
│   ├── property-service/
│   ├── concessions-management-service/
│   ├── gis-service/
│   ├── documents-service/
│   ├── valuation-service/
│   ├── billing-service/
│   ├── payment-service/
│   ├── reconciliation-service/
│   ├── reporting-service/
│   └── croip-integration-service/
├── packages/
│   ├── contracts/                  # Local Zod contracts (stand-in for @croip/contracts)
│   └── tsconfig/                   # Shared TypeScript base configs
├── infra/docker/
│   ├── docker-compose.yml          # PostgreSQL (11 DBs) + RabbitMQ
│   ├── postgres-init/              # Creates the 11 isolated databases
│   └── zitadel/                    # Local ZITADEL identity provider (dev)
├── scripts/
│   ├── generate-services.mjs       # Regenerates services/* from the golden template
│   ├── dev/                        # start-all, stop-all, smoke-test, publish-event,
│   │                               # zitadel-bootstrap
│   └── service-template/           # Golden microservice template
├── package.json
├── pnpm-workspace.yaml
└── turbo.json
```

## Prerequisites

- Node.js 24+
- pnpm 12+
- Docker Engine with Docker Compose v2

## Getting started

```bash
pnpm install            # install workspace dependencies
pnpm db:up              # start PostgreSQL (11 databases) + RabbitMQ
pnpm prisma:generate    # generate Prisma clients for all services
pnpm typecheck          # type-check the whole workspace
pnpm build              # build all packages, services and the portal
```

### Run and test everything

```bash
pnpm dev:all            # infra + 11 services + 22 workers + portal
pnpm smoke              # end-to-end check of every flow
pnpm dev:stop           # stop all app processes (containers keep running)
```

`pnpm dev:all` starts every process in the background and writes logs to `.dev-logs/`.
`pnpm smoke` publishes a CROIP registration event, follows it through the bridge,
verification, valuation, billing, payment, reconciliation, reporting and upstream sync,
and prints PASS/FAIL per step.

Open the portal at <http://localhost:3000> — dashboard, ratepayers, properties, billing,
payments and the concessions management workspace read live from the services.

Local dev infrastructure (see `infra/docker/docker-compose.yml`):

- PostgreSQL: `127.0.0.1:5433` (one isolated database per service; a host Postgres on
  `5432` is avoided on purpose)
- RabbitMQ: `127.0.0.1:5672` (management UI on `127.0.0.1:15672`)

To run a single service locally (dev auth mode, no ZITADEL required):

```bash
cd services/ratepayer-service
Copy-Item .env.example .env
pnpm prisma:generate
pnpm prisma:deploy     # apply migrations to the service-owned database
pnpm dev               # http://localhost:3020
```

Health endpoints on every service: `/health/live`, `/health/ready`, `/metrics`, `/docs`.

## Schema upgrade (concession & GIS expansion)

The operational schema follows [docs/update.md](docs/update.md):

- `property-registry-service` is now **`property-service`** (`@idarms/property-service`) and
  owns the concessionaire portfolio, dual identifiers, GIS coordinates and verification audit.
- **`concessions-management-service`** (`concession_mgmt_db`, port 3100) owns concession
  contracts, assemblies, classification lookups and annual fee-fixing bylaws.
- **`gis-service`** (`gis_spatial_db`, port 3110) owns assembly-scoped spatial zones and blocks.
- Billing consumes `fee_fixing.published.v1` into a local `FeeFixingReplica`; payments are
  provider-agnostic `PaymentTransaction` records; documents use the presigned-upload metadata
  model (`storageKey`, `uploadStatus`, `mimeType`, `fileSize`).

## Concession management

The portal now includes a dedicated Concession Management workspace backed by
`concessions-management-service` and `gis-service`:

- **Portfolio overview** — onboarding readiness, rate configuration, pending approvals and
  recent immutable audit activity.
- **Assembly onboarding** — contract link, CROIP identifier, branding, GIS coverage,
  administrator, fee-fixing completion, revenue target and agent coverage (8 readiness checks).
- **Contracts & splits** — state/concessionaire revenue shares and linked assemblies.
- **Fee-fixing workbench** — fiscal-year rate matrix with prior-year deltas, draft autosave,
  completion filters and an impact summary. Exporting or publishing is guarded.
- **Dual-control approvals** — a submitted matrix moves to `PENDING_APPROVAL`; a different
  authorised Assembly Administrator must approve it. Concession Support can prepare drafts
  but cannot publish MMDA rates. Approval emits `fee_fixing.published.v1` per rate row
  through the transactional outbox.
- **Targets & performance** — annual targets with monthly and per-agent implications.
- **Zones & agents** — GIS zones/blocks and field-agent assignments.
- **Audit ledger** — append-only, human-readable and CSV-exportable.

Seed local concession data after applying migrations:

```bash
pnpm --filter @idarms/concessions-management-service prisma:deploy
pnpm concessions:seed
```

The seed is idempotent and creates the local concession contract, property-type/usage
lookups and two sample assemblies for UI work.

## Event pipeline

Each service runs an HTTP API plus one or two RabbitMQ workers. The bridge
(`croip-integration-service`) relays both directions and uses its outbox worker to publish to
either `idarms.events` or `croip.events` depending on the routing key.

| Service | HTTP | Workers |
| --- | --- | --- |
| ratepayer-service | 3020 | inbox |
| property-service | 3010 | inbox, outbox |
| documents-service | 3050 | inbox, outbox |
| valuation-service | 3060 | inbox, outbox |
| billing-service | 3030 | inbox, outbox |
| payment-service | 3040 | inbox, outbox |
| reconciliation-service | 3070 | inbox, outbox |
| reporting-service | 3080 | inbox, outbox |
| croip-integration-service | 3090 | downstream, upstream, outbox |
| concessions-management-service | 3100 | inbox, outbox |
| gis-service | 3110 | inbox, outbox |

```bash
pnpm --filter @idarms/ratepayer-service dev
pnpm --filter @idarms/ratepayer-service worker:inbox
```

Key write endpoints (local operations):

- `POST /v1/properties/:id/verify` — field verification (emits `property.verified.v1`)
- `POST /v1/payments/checkout` — initiate payment (requires `Idempotency-Key` header)
- `POST /v1/payments/webhook` — gateway callback (HMAC-verified when `GATEWAY_WEBHOOK_SECRET` is set)

Simulate a downstream CROIP event without the bridge:

```bash
pnpm event:publish ratepayer.registered.v1 @payload.json            # idarms.events
RABBITMQ_EXCHANGE=croip.events pnpm event:publish croip.ratepayer.registered.v1 @payload.json
```

## Authentication

iDARMS runs two independent authentication realms, exactly as specified in the master spec:

| Realm | Who authenticates | Identity provider | Purpose |
| --- | --- | --- | --- |
| Internal iDARMS | Field agents, concession admins, municipal staff using the portal | **iDARMS ZITADEL** (local: `http://localhost:8080`; future production placeholder: `https://auth.idarms.com`) | Local users, sessions and operational roles |
| Upward sync to CROIP | The iDARMS backend (machine-to-machine) | **CROIP ZITADEL** (`https://auth.croip.gov.gh`) | Validates M2M credentials (`concession:data-producer`) before accepting upward syncs |

### Local ZITADEL instance (dev)

The repository ships a config-as-code bootstrap for the **current local ZITADEL** at
`http://localhost:8080`. There is no production deployment yet. The future production
issuer (`auth.idarms.com`) and CROIP issuer (`auth.croip.gov.gh`) are not required for
local development.

```bash
pnpm zitadel:up          # start ZITADEL (Traefik + API + Login UI + Postgres)
pnpm zitadel:bootstrap   # idempotent provisioning of project, apps, roles, users, action
```

The bootstrap creates:

- Project **iDARMS** with `projectRoleAssertion` enabled (required for role claims).
- OIDC web app **idarms-portal** (authorization-code + refresh, JWT access tokens,
  `accessTokenRoleAssertion`, `idTokenRoleAssertion`).
- API app **idarms-api**.
- **8 human project roles** — `CONCESSION_SUPER_ADMIN`, `ASSEMBLY_ADMIN`,
  `FIELD_OPS_MANAGER`, `FINANCE_OFFICER`, `SECRETARY`, `CASHIER`, `FIELD_AGENT`,
  `ASSEMBLY_VIEWER` — plus the machine role `CROIP_M2M`. Capabilities such as
  `property:verify`, `fee_fixing:manage` and `portfolio:reporting:read` are bundled
  into these roles by the shared model in `packages/contracts/src/roles.ts`; they are
  not separate ZITADEL roles. The bootstrap retires the old flat permission roles.
- Human users `concession-admin` (`CONCESSION_SUPER_ADMIN`) and `field-agent`
  (`FIELD_AGENT`), password `Password1!`.
- Machine user `croip-m2m` (JWT client-credentials) as the stand-in for the CROIP-issued
  M2M client.
- No `idarmsContext` token action and no `concessionId`/`assemblyId` user metadata:
  tenant context is resolved from ZITADEL organization claims through the
  `orgId → concessionId/assemblyId` registry exposed by the concessions service.

Admin console: <http://localhost:8080> (`zitadel-admin@zitadel.localhost` / `Password1!`).
The bootstrap is idempotent and safe to re-run; secrets are printed on first creation only
(and are stored in `apps/idarms-portal/.env.local`).

### Assembly onboarding (local)

The concessions service owns a rollback-capable provisioning saga at
`POST /v1/assemblies/:id/onboard`, restricted to `CONCESSION_SUPER_ADMIN` or
`PLATFORM_ADMIN`. It creates the assembly's ZITADEL organization, grants the iDARMS
project (including `CONCESSION_SUPER_ADMIN` so external super-admin grants are valid),
grants every existing super admin in the new org, optionally invites the first
`ASSEMBLY_ADMIN`, writes `zitadel_org_contexts`, and invalidates the Access Directory
cache. Saga state lives in `assembly_onboardings`; retries clean up a prior partial org
instead of creating a duplicate.

Export the local admin key once:

```bash
pnpm zitadel:export-key   # writes gitignored .secrets/zitadel-admin-sa.json
```

The provisioning client hard-rejects any host other than `localhost`, `127.0.0.1`, or
`[::1]`, enforcing the local-only scope lock. See
`services/concessions-management-service/README.md` for the step list and failure
semantics.

### Portal login

The portal uses Auth.js (NextAuth v5) with the Zitadel provider. After `pnpm zitadel:bootstrap`,
set `apps/idarms-portal/.env.local`:

```bash
AUTH_SECRET=<openssl rand -base64 32>
ZITADEL_ISSUER=http://localhost:8080
ZITADEL_CLIENT_ID=<web app client id>          # printed by bootstrap
ZITADEL_CLIENT_SECRET=<web app client secret>  # printed by bootstrap
```

The bootstrap also applies iDARMS's teal and neutral palette to ZITADEL's hosted login
and configures the iDARMS project to use that organization branding. Users enter credentials
on ZITADEL's hosted sign-in page; the portal never receives their passwords.

Run `pnpm --filter @idarms/idarms-portal dev` and open <http://localhost:3000/login>.
Unauthenticated visitors are redirected straight to ZITADEL's branded username/password
form; the portal also proxies ZITADEL's login UI assets without applying portal auth
middleware to them. After sign-in, users return to the portal dashboard. For local
development, use `concession-admin` / `Password1!`. Signing out clears the portal session
and ends the ZITADEL SSO session before returning to the public signed-out page. If the
portal is deployed at a non-local URL, set `PORTAL_URL` when running
`pnpm zitadel:bootstrap` so ZITADEL registers the correct logout callback.

The access token carries:

- `urn:zitadel:iam:org:project:roles` — `{ role: { orgId: orgDomain } }`, including
  external assembly-org grants for the Concession Super Admin.
- No `urn:zitadel:iam:user:resourceowner:id` claim in the current local v4.16.0 instance.
  The portal and services therefore infer an Assembly Admin's home org from the org ID
  attached to their `ASSEMBLY_ADMIN` role grant and resolve it through
  `zitadel_org_contexts`. A Super Admin keeps portfolio scope.
- No `urn:idarms:context` claim.

### Staff & Access / Access Directory (local)

The two staff screens are live at:

- **Staff & Access** — `/assembly/:assemblyId/staff-access` for an Assembly Admin's own
  assembly (no assembly selector).
- **Access Directory** — `/portfolio/access-directory` for a Concession Super Admin,
  listing only assemblies returned by the live per-org grant query. Drilling into an
  assembly opens the same Staff & Access workspace with an assembly switcher.

### Activity & Audit / Audit Ledger (local)

- **Activity & Audit** — `/assembly/:assemblyId/activity-audit` for an Assembly Admin
  (and for a Super Admin opening an assembly directly). It is scoped by the same
  `resolveStaffAccess()` check as Staff & Access and lists only that assembly's audit
  rows, including Super Admin actions with a distinct badge.
- **Audit Ledger** — `/portfolio/audit-ledger` for a Concession Super Admin. **My
  actions** shows only the caller's own actions across assemblies returned by the live
  per-org grant query. **Per-assembly activity** reuses the same audit history view as
  Activity & Audit for one explicitly selected assembly; there is no merged cross-assembly
  timeline.
- Both screens support date-range, action-type, and actor filters, pagination, and bulk
  import batch drill-in via `GET /v1/assemblies/:assemblyId/staff/bulk-import/:batchId`.
- Audit descriptions are rendered by the shared formatter in
  `packages/contracts/src/audit.ts`; filtering uses structured columns/metadata rather
  than parsing those sentences.
- Migration `20261023120000_audit_activity_ledger` adds actor/action query indexes and
  backfills `metadata.actorRole` on pre-existing onboarding rows.

### Preview experience (simulation only)

The **Preview experience** utility lets a Concession Super Admin or Platform Admin view
a generic persona's assembly workspace without impersonating a real user:

- Entry points: the **Preview experience** button on **Access Directory**, and
  `/preview` for Platform Admins (also available to Super Admins).
- Personas: Assembly Admin, Field Ops Manager, Finance Officer, Secretary, Cashier,
  Field Agent, Assembly Viewer.
- `/preview/:persona` renders entirely from
  `apps/idarms-portal/src/lib/preview-fixtures.ts` — a fake **Demo Assembly**, fake
  `@example.test` identities, fake metrics, and fake audit rows. It never reads AMA,
  LADMA, the database, or ZITADEL.
- Every preview screen has a sticky **PREVIEW MODE — Simulated [Persona] view. No real
  data. Read-only.** banner and an always-visible **Exit preview** control. Every
  mutation control is disabled with “Disabled in preview mode.”
- Preview mode does not change the session, token, or permissions. The preview route
  does not call `auth()`, `idarmsRequest`, ZITADEL, or any provisioning endpoint; it
  decrypts the existing NextAuth session cookie without refreshing it and verifies that
  the preview ticket belongs to the same actor. A different user in the same browser is
  denied even if an old preview cookie remains.
- Entering preview writes one lightweight `preview.entered` audit row through
  `POST /v1/preview/audit` (actor, persona, timestamp). The preview screen itself makes
  no further API calls.
- `apps/idarms-portal/scripts/preview-static.test.mjs` statically enforces that the
  preview route/workspace/fixtures have no auth or backend API imports, use only
  `@example.test` identities, and always render the banner/exit/disabled controls.

Navigation is persona-aware: an `ASSEMBLY_ADMIN` sees **Assembly Administration → Staff &
access** and **Activity & audit**, a `CONCESSION_SUPER_ADMIN` sees **Concession Portfolio →
Access directory** and **Audit ledger**, and a user with neither role sees neither item.

Local login fixtures:

| Persona | Login | Password |
|---|---|---|
| Concession Super Admin | `concession-admin` | `Password1!` |
| AMA Assembly Admin | `ama-active-admin@idarms.local` | `Password1!` |

The AMA fixture is an active `ASSEMBLY_ADMIN` in the AMA org created for local UI testing;
the onboarding saga's optional first-admin invite creates an `INITIAL` user instead, which
must be activated before it can sign in. ZITADEL keeps its SSO session across a portal
sign-out, so switch personas with RP-initiated logout or a private browser window.

The concessions service must validate real portal tokens for these screens:

```bash
AUTH_MODE=zitadel
ZITADEL_ISSUER=http://localhost:8080
ZITADEL_AUDIENCE=<idarms-portal client id>
ZITADEL_JWKS_URI=http://localhost:8080/oauth/v2/keys
```

### Service-side validation

Every service's auth plugin (ZITADEL mode) validates the JWT signature against the ZITADEL
JWKS, checks `issuer` and `audience`, then:

- parses role grants into `roleGrants` / `authorizedOrgIds`;
- derives capabilities from the shared role model (`capabilitiesForRoles`);
- resolves `concessionId` / `assemblyId` from the org registry via `ORG_CONTEXT_URL`.

Endpoints opt in with `requirePermissions([...])`.

Enable it per service in its `.env`:

```bash
AUTH_MODE=zitadel
ZITADEL_ISSUER=http://localhost:8080
ZITADEL_AUDIENCE=<web app client id>   # tokens minted for the portal
ZITADEL_JWKS_URI=http://localhost:8080/oauth/v2/keys
ORG_CONTEXT_URL=http://localhost:3100
```

Health/docs endpoints (`/health/live`, `/health/ready`, `/metrics`, `/docs`) stay public;
payment-service additionally keeps `POST /v1/payments/webhook` public (gateway callback).

Access tokens have a **5-minute lifetime** (instance OIDC setting, applies to all apps).
Suspending a user deactivates the ZITADEL account and deletes all of that user's ZITADEL
sessions, which revokes refresh tokens immediately; existing access tokens expire within
five minutes. The Access Directory uses live grant queries with a 15-second cache rather
than the token's role snapshot.

### CROIP integration

Operational events are translated to CloudEvents and sent by the integration service to
CROIP's Reporting Gateway (`POST /v1/events`). Configure
`CROIP_REPORTING_GATEWAY_URL`, `CROIP_ZITADEL_ISSUER`, `CROIP_CLIENT_ID`, and
`CROIP_CLIENT_SECRET`; the machine client must be granted `gateway:ingest`. The service only
marks an event as delivered after CROIP returns a valid `202` ingestion receipt.

Ratepayer and property registration are separate direct writes from the portal to
`POST /v1/ratepayers` and `POST /v1/properties`. The portal fields are mapped to CROIP's
request schemas; the machine client needs the corresponding CROIP registration permissions,
including `properties:manage` for property writes. For local CROIP development, configure
`CROIP_RATEPAYER_API_URL` and `CROIP_PROPERTY_API_URL` separately (the documented service
ports are `3030` and `3020`); hosted deployments can point both at their API gateway.

The local downstream RabbitMQ consumer is not itself proof of a CROIP-to-iDARMS feed. Its
exchange binding requires an actual broker connection/bridge and external event contract.
Until CROIP confirms that design, ratepayer/property registration success means CROIP accepted
the write; it does not mean iDARMS has synchronized a local replica.

### Development auth (no ZITADEL)

Set `AUTH_MODE=disabled` only for local development. The configuration refuses this value when
`NODE_ENV=production`. In dev mode the context comes from headers:

- `x-idarms-concession-id`
- `x-idarms-assembly-id`
- `x-idarms-actor-id`
- `x-idarms-roles` (comma-separated project roles)
- `x-idarms-authorized-org-ids` (comma-separated ZITADEL org IDs the caller may act in;
  staff endpoints validate the assembly's org against this list)
- `x-idarms-org-id` (optional single active org; defaults `authorizedOrgIds` to it)
- `x-idarms-permissions` (comma-separated; defaults to all service permissions)

## Regenerating services

`pnpm services:generate` regenerates `services/*` from the golden template. It is intended for
**initial scaffolding only** — it overwrites template-derived files, including `src/events`,
`src/modules` and `src/config.ts`. Once a service has bespoke business logic (Phase 2+), edit
its source directly and do not regenerate that service.
