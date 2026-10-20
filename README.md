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

### Run and test everything

```bash
pnpm dev:all            # infra + 9 services + 17 workers + portal
pnpm smoke              # end-to-end check of every flow
pnpm dev:stop           # stop all app processes (containers keep running)
```

`pnpm dev:all` starts every process in the background and writes logs to `.dev-logs/`.
`pnpm smoke` publishes a CROIP registration event, follows it through the bridge,
verification, valuation, billing, payment, reconciliation, reporting and upstream sync,
and prints PASS/FAIL per step.

Open the portal at <http://localhost:3000> — dashboard, ratepayers, properties, billing
and payments pages read live from the services.

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

## Event pipeline

Each service runs an HTTP API plus one or two RabbitMQ workers. The bridge
(`croip-integration-service`) relays both directions and uses its outbox worker to publish to
either `idarms.events` or `croip.events` depending on the routing key.

| Service | HTTP | Workers |
| --- | --- | --- |
| ratepayer-service | 3020 | inbox |
| property-registry-service | 3010 | inbox, outbox |
| documents-service | 3050 | inbox, outbox |
| valuation-service | 3060 | inbox, outbox |
| billing-service | 3030 | inbox, outbox |
| payment-service | 3040 | inbox, outbox |
| reconciliation-service | 3070 | inbox, outbox |
| reporting-service | 3080 | inbox, outbox |
| croip-integration-service | 3090 | downstream, upstream, outbox |

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

## Development auth

Set `AUTH_MODE=disabled` only for local development. The configuration refuses this value when
`NODE_ENV=production`. In dev mode the context comes from headers:

- `x-idarms-concession-id`
- `x-idarms-assembly-id`
- `x-idarms-actor-id`
- `x-idarms-permissions` (comma-separated; defaults to all service permissions)

## Regenerating services

`pnpm services:generate` regenerates `services/*` from the golden template. It is intended for
**initial scaffolding only** — it overwrites template-derived files, including `src/events`,
`src/modules` and `src/config.ts`. Once a service has bespoke business logic (Phase 2+), edit
its source directly and do not regenerate that service.
