# iDARMS Platform

Decoupled Concessionaire Microservice Ecosystem & CROIP Sync Bridge.

iDARMS is the **local operational backend** for a concessionaire. It is a replaceable edge
terminal: CROIP (Apex) is the permanent system of record, and iDARMS holds a read-only replica
of CROIP master data plus local operational data (field verifications, billing, payments).

Full architecture and build rules live in
[docs/IDARMS_MASTER_SPEC.md](docs/IDARMS_MASTER_SPEC.md). The per-service engineering
baseline is documented in [docs/golden_template.md](docs/golden_template.md).

## Key rules

- **Microservices only** — exactly 1 frontend (`apps/idarms-portal`) and 9 backend services
  (`services/*`). No monolith.
- **Database isolation** — every service owns its own PostgreSQL database. Cross-service SQL
  joins are forbidden.
- **Event-driven** — services communicate only via RabbitMQ (`idarms.events` exchange) using
  Transactional Outbox + Inbox patterns.
- **Multi-assembly tenancy** — every domain table carries `concessionId` and `assemblyId`
  extracted from the `urn:idarms:context` ZITADEL JWT claim.
- **CQRS routing** — the Next.js frontend performs *writes* directly against the CROIP Apex
  API, and *reads / local operations* against the local iDARMS services.

## Repository layout

```
idarms-platform/
├── apps/
│   └── idarms-portal/              # Next.js 16 Admin & Field Agent UI
├── services/                       # 9 independent Fastify microservices
│   ├── ratepayer-service/
│   ├── property-registry-service/
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
│   ├── docker-compose.yml          # PostgreSQL (9 DBs) + RabbitMQ
│   └── postgres-init/              # Creates the 9 isolated databases
├── scripts/
│   ├── generate-services.mjs       # Regenerates services/* from the golden template
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
pnpm db:up              # start PostgreSQL (9 databases) + RabbitMQ
pnpm prisma:generate    # generate Prisma clients for all services
pnpm typecheck          # type-check the whole workspace
pnpm build              # build all packages, services and the portal
```

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

## Development auth

Set `AUTH_MODE=disabled` only for local development. The configuration refuses this value when
`NODE_ENV=production`. In dev mode the context comes from headers:

- `x-idarms-concession-id`
- `x-idarms-assembly-id`
- `x-idarms-actor-id`
- `x-idarms-permissions` (comma-separated; defaults to all service permissions)

## Regenerating services

Service code is generated from the golden template. Edit
[scripts/service-template](scripts/service-template) or
[scripts/generate-services.mjs](scripts/generate-services.mjs), then run:

```bash
pnpm services:generate
```
