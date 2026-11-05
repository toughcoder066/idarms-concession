# iDARMS Platform

Decoupled Concessionaire Microservice Ecosystem & CROIP Sync Bridge.

iDARMS is the **local operational backend** for a concessionaire. It is a replaceable edge
terminal: CROIP (Apex) is the permanent system of record, and iDARMS holds a read-only replica
of CROIP master data plus local operational data (field verifications, billing, payments).

Full architecture and build rules live in
[docs/IDARMS_MASTER_SPEC.md](docs/IDARMS_MASTER_SPEC.md). The per-service engineering
baseline is documented in [docs/golden_template.md](docs/golden_template.md).

New here? [docs/HOW_IT_WORKS.md](docs/HOW_IT_WORKS.md) explains sign-in, organisations, admin
roles and assembly onboarding in plain English, and why they are set up that way.

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

- **Concession overview** — onboarding readiness, rate configuration, pending approvals and
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
pnpm zitadel:bootstrap   # idempotent: concession org, project, apps, roles, grants, machine identities
```

Organisations (ADR-0003 decision 7). ZITADEL is the identity infrastructure; iDARMS is the
business application, and normal administration happens in the iDARMS portal, not the
ZITADEL console.

| ZITADEL organisation | Org registry | Holds |
|---|---|---|
| ZITADEL default org | never registered | ZITADEL's own project and console clients, instance administration, the first-instance admin key, and `croip-m2m` (a dev stand-in for CROIP's own credential) |
| **iDARMS Concession** | `CONCESSION`, concession id, no assembly | The **iDARMS project** (9 roles, `idarms-portal` and `idarms-api` apps), the machine identities `idarms-login-client` and `idarms-provisioner`, concession-wide users |
| One org per assembly | `ASSEMBLY`, same concession id, its assembly id | That assembly's staff; uses the project through a project grant from the concession org |

The bootstrap, against the local ZITADEL:

- Finds or creates the **iDARMS Concession** org (name: `IDARMS_CONCESSION_ORG_NAME`) and applies
  the iDARMS login colors to it (the project uses its owner's branding).
- Creates the **iDARMS** project in that org with `projectRoleAssertion`, the OIDC web app
  **idarms-portal** (authorization code + refresh, JWT access tokens, role assertion) and
  the API app **idarms-api**. Their client ids and secrets go to the gitignored
  `.secrets/zitadel-idarms-apps.json`; secrets are never printed.
- Creates the **9 project roles**: `CONCESSION_SUPER_ADMIN`, `ASSEMBLY_ADMIN`, `FIELD_OPS_MANAGER`,
  `FINANCE_OFFICER`, `SECRETARY`, `CASHIER`, `FIELD_AGENT`, `ASSEMBLY_VIEWER` and the machine
  role `CROIP_M2M`. Capabilities such as `property:verify` are bundled into these roles by
  `packages/contracts/src/roles.ts`; they are not separate ZITADEL roles.
- Ensures `concession-admin` (`CONCESSION_SUPER_ADMIN`, password `Password1!`) in the concession
  org. It holds only that iDARMS role: no human gets ZITADEL's `ORG_OWNER` or `PROJECT_OWNER`
  on the concession org, and the bootstrap reports any that exist.
- Grants the project to every existing assembly org and recreates their user grants (and
  the super admin's grants there) by copying them from the previous project.
- Creates the iDARMS machine identities in the concession org, each with exactly one
  instance role and a key in `.secrets/` (never printed):
  - `idarms-login-client`: `IAM_LOGIN_CLIENT`, for the portal-hosted login (ADR-0004).
  - `idarms-provisioner`: `IAM_ORG_MANAGER`, for assembly onboarding and staff management.
    It is the narrowest ZITADEL role that can create organisations; see ADR-0003 for what
    else it allows.
- Leaves `croip-m2m` and everything else in ZITADEL's default org unchanged.
- Registers the concession org in the org registry with `org:register-concession`.

The **previous iDARMS project**, owned by ZITADEL's default org, is only read, and only if it
still exists. In local development it and the older `idarms-portal-login` machine user were
deleted on 5 Nov 2026 with owner approval (ADR-0003 decision 9). Staging and production register the concession org with the operator
command in `services/concessions-management-service/README.md`.

Admin console (operators only): <http://localhost:8080> (`zitadel-admin@zitadel.localhost` /
`Password1!`). The bootstrap is idempotent and safe to re-run; it prints which values go into
each `.env` file and where the secrets are.

### Assembly onboarding (local)

The concessions service owns a rollback-capable provisioning saga at
`POST /v1/assemblies/:id/onboard`, restricted to `CONCESSION_SUPER_ADMIN` or
`PLATFORM_ADMIN`. It creates the assembly's ZITADEL organization, grants the iDARMS
project (including `CONCESSION_SUPER_ADMIN` so external super-admin grants are valid),
grants every existing super admin in the new org, optionally invites the first
`ASSEMBLY_ADMIN`, writes `zitadel_org_contexts`, and invalidates the Access Directory
cache. Saga state lives in `assembly_onboardings`; retries clean up a prior partial org
instead of creating a duplicate.

Onboarding provisions only an assembly that CROIP has assigned to the concession: the
assembly's CROIP id must be on the active assigned-assembly list of
`croip-integration-service` (`CROIP_INTEGRATION_URL`), or it is refused with 409
`assembly_not_assigned`. ZITADEL calls use the `idarms-provisioner` key
(`.secrets/zitadel-provisioner.json`, written by the bootstrap), never the first-instance
admin key.

The provisioning client hard-rejects any host other than `localhost`, `127.0.0.1`, or
`[::1]`, enforcing the local-only scope lock. See
`services/concessions-management-service/README.md` for the step list and failure
semantics.

### Portal login

The portal hosts its own login screens and authenticates through ZITADEL's Session API
on the server; the browser never visits ZITADEL (ADR-0004). After `pnpm zitadel:bootstrap`
(or, on an existing instance, `pnpm zitadel:login-client`), set `apps/idarms-portal/.env.local`:

```bash
AUTH_SECRET=<openssl rand -base64 32>
AUTH_URL=http://localhost:3000                  # portal origin; https in production
ZITADEL_ISSUER=http://localhost:8080
ZITADEL_CLIENT_ID=<portal client id>          # printed by bootstrap
ZITADEL_CLIENT_SECRET=<portal client secret>  # in .secrets/zitadel-idarms-apps.json
ZITADEL_PROJECT_ID=<iDARMS project id>        # printed by bootstrap
ZITADEL_LOGIN_CLIENT_KEY_PATH=<repo>/.secrets/zitadel-idarms-login-client.json
```

`pnpm zitadel:login-client` creates the `idarms-login-client` machine user in the iDARMS
Concession org with the instance role `IAM_LOGIN_CLIENT`, writes its key to `.secrets/`
(gitignored, never printed) and points the `idarms-portal` app's login page at the portal.

Run `pnpm --filter @idarms/idarms-portal dev` and open <http://localhost:3000/login>.
The portal's own pages cover sign-in (`/login`), forgot and reset password
(`/password/forgot`, `/password/reset`), a password change ZITADEL requires
(`/password/change`) and accepting an invitation (`/invite/accept`). After sign-in,
users return to the page they asked for (or the dashboard). For local development, use
`concession-admin` / `Password1!`. Signing out ends the ZITADEL session and revokes the
refresh token on the server, then shows the public signed-out page. The local stack has no
SMTP, so reset and invitation emails are not delivered until ZITADEL is given an SMTP server.

The access token carries:

- `urn:zitadel:iam:org:project:roles` — `{ role: { orgId: orgDomain } }`, including
  external assembly-org grants for the Concession Super Admin.
- `urn:zitadel:iam:user:resourceowner:id` — the user's home organisation. The portal
  requests it with the `urn:zitadel:iam:user:resourceowner` scope. It is resolved through
  `zitadel_org_contexts` to the concession, the assembly and the scope (`CONCESSION` or
  `ASSEMBLY`); an unregistered org has no tenant. A token without it is refused
  (401 `home_org_missing`, logged); the home org is never inferred from role grants.
- Permissions come only from roles granted in the home organisation, and only the
  iDARMS project's role claims count (`ZITADEL_PROJECT_ID`).
- No `urn:idarms:context` and no `urn:idarms:permissions` claim (ADR-0003).

### Staff & Access / Access Directory (local)

The two staff screens are live at:

- **Staff & Access** — `/assembly/:assemblyId/staff-access` for an Assembly Admin's own
  assembly (no assembly selector).
- **Access Directory** — `/concession/access-directory` for a Concession Super Admin,
  listing only assemblies returned by the live per-org grant query. Drilling into an
  assembly opens the same Staff & Access workspace with an assembly switcher.

### Activity & Audit / Audit Ledger (local)

- **Activity & Audit** — `/assembly/:assemblyId/activity-audit` for an Assembly Admin
  (and for a Super Admin opening an assembly directly). It is scoped by the same
  `resolveStaffAccess()` check as Staff & Access and lists only that assembly's audit
  rows, including Super Admin actions with a distinct badge.
- **Audit Ledger** — `/concession/audit-ledger` for a Concession Super Admin. **My
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
access** and **Activity & audit**, a `CONCESSION_SUPER_ADMIN` sees **Concession →
Access directory** and **Audit ledger**, and a user with neither role sees neither item.

Local login fixtures:

| Persona | Login | Password |
|---|---|---|
| Concession Super Admin (concession org) | `concession-admin` | `Password1!` |
| AMA Assembly Admin | `ama-active-admin@idarms.local` | `Password1!` |

The AMA fixture is an active `ASSEMBLY_ADMIN` in the AMA org created for local UI testing;
the onboarding saga's optional first-admin invite creates an `INITIAL` user instead, which
must accept its invitation at `/invite/accept` before it can sign in. Portal sign-out ends
the ZITADEL session, so switching personas only needs a sign-out and a new sign-in.

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
