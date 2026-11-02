# Golden template rules (iDARMS Microservice Golden Template Usage Guide v1.0, 10 Oct 2026)

Full text: `docs/source/idarms-golden-template-guide-v1.0.md`. This is the distilled rule set. Section numbers refer to the guide.

## Required outcome (Purpose)
A service runs **independently without Envoy**, owns its PostgreSQL database, validates ZITADEL tokens, enforces concession and District Assembly boundaries, publishes events through the transactional outbox, and exposes health, OpenAPI and metrics.

## Baseline
Node 24, Fastify 5 + TypeScript, Prisma + PostgreSQL, ZITADEL JWT/JWKS, RabbitMQ, Docker/Compose. Inherited by every service: Fastify bootstrap and error envelope, env validation (auth cannot be disabled in production), token verification and permission hooks, Prisma schema with audit, idempotency, outbox and inbox models, a separate outbox publisher process, OpenAPI/health/metrics/structured logs, non-root image.

## Boundaries (§1, §3)
One service per bounded capability. Write a short **service charter** (responsibility, owned data, what it does not own, commands, events, synchronous dependencies, asynchronous consumers) before creating production data. Boundary test: explainable in one sentence; sole writer of its tables; others interact via documented APIs or events; independently releasable; independently restorable.

## Layout (§4)
`routes.ts` (method, path, schema, permission, call service, map result), `service.ts` (rules, one DB transaction, no Fastify reply handling), `policy.ts`, `schemas.ts`; plus `events/`, `plugins/`, `workers/`. Package `@idarms/<name>-service`, repo `idarms-<name>-service`.

## Database (§6)
One logical database per service. Another service must **not** read or write its tables, even in the same Postgres cluster. Migrations: review generated SQL, never edit an applied migration, additive before destructive, no large backfill at startup, run `prisma migrate deploy` as a separate job before app start, record reconciliation checks for financial/ownership changes.

## Tenancy (§8, §9)
Verified claim `urn:idarms:context` = `{concessionId, assemblyId}`. Validate signature, issuer, audience, lifetime in the service (a gateway does not replace this). Every business query filters by concession **and** Assembly. Reject: tenant IDs from request bodies without comparing to the token; fetch-by-ID then check tenancy afterwards; admin bypass; unrestricted repository functions. Required tests: right/right returns the resource; right concession + wrong Assembly -> 404/403; wrong concession leaks nothing; missing permission -> 403 problem response; invalid/expired token -> 401 before business logic.

## Events (§10, §11)
Never publish to RabbitMQ from the API transaction. Business row, audit record and outbox row commit together (`appendOutboxEvent(tx, 'x.y.v1', event)`). A worker publishes with confirms, row claiming (`FOR UPDATE SKIP LOCKED`) and bounded exponential retry. Owner defines dead-letter alerting, replay approval, maximum backlog age. Envelope: unique event ID, type + schema version, producer, aggregate type/ID/version, concession ID, Assembly ID, correlation ID, causation ID, occurrence time, minimum payload. Consumers use `processOnce` (insert message ID, change, record completion in one transaction), ack after commit, dead-letter malformed events, use `aggregateVersion` where order matters.

## Idempotency and audit (§12)
`Idempotency-Key` required for payments, reversals, refunds and any retry-sensitive command. Store key + concession + request hash + response. New key processes. Same key + same hash returns the stored outcome. Same key + different hash -> conflict, no processing. Concurrent same key -> one winner. Audit privileged, ownership, assessment and financial actions with actor, institution context, action, resource, request ID, outcome. No passwords, tokens, payment credentials or unnecessary identity documents in metadata.

## Tests and done (§13)
Layers: unit, route, DB integration, event contract, reliability (duplicates, delays, retry, recovery), security (invalid tokens, wrong audience, missing roles, cross-tenant). Commands: `npm run typecheck`, `npm test`, `npm audit --omit=dev`, `npm run build`. **Done** = business criteria, authorisation tests, API and event contracts, migration, audit evidence, metrics, docs and recovery steps.

## Docker and integration (§14, §15)
Containers: `service`, `outbox-worker`, `migrate`, `postgres`, `rabbitmq`. `docker compose down -v` deletes local data and must never appear in a shared or production procedure. Integrate services by DNS name, versioned routing keys, contract + tenancy + duplicate + recovery tests. Add Envoy only for a shared external address; services stay callable without it, business authorisation stays inside each service.

## CI and production (§16, §17)
PR checks: lockfile consistency, typecheck, tests, dependency audit, Prisma validation, contract comparison (breaking change needs approval), container build. Deployment: immutable signed image, backup + forward-compatible migration, service and worker on the same version, readiness check, gateway smoke tests, monitor outbox backlog. Readiness evidence: ownership, identity, isolation, database restore, messaging (confirm/duplicate/retry/DLQ/replay), security, operations, recovery, contracts, acceptance.

---

## Where the guide's examples diverge from the iDARMS design (ADR-0001)

| Guide example | Under ADR-0001 |
|---|---|
| §3 Property Registry charter: "Maintain the authoritative property record", "Owned data: property identity, location, classification, status" | The iDARMS property service is a **replica + registration proxy**. Owned data is the replica and pending-registration requests only. CROIP owns the record. |
| §3 commands: Submit/Update/Verify/Merge property | Submit/Update/Verify are **forwarded to CROIP**. Merge and verification outcomes are CROIP decisions. |
| §3 events: `PropertySubmitted`, `PropertyVerified`, ... produced by iDARMS | iDARMS consumes CROIP's property events. It produces internal events only for things it owns. Do not republish CROIP data as if iDARMS authored it. |
| §3 "Asynchronous consumers ... CROIP integration services" | Correct for billing/payments reporting (flow B). For property/ratepayer the direction is reversed for sync (flow A). |
| §6 sample `Property` model with `concessionId`/`assemblyId` and local `reference` | Replica model keyed by `croipPropertyId` with CROIP `version`. Local `reference` secondary. |
| §15 Envoy routes `/api/v1/properties/*`, `/ratepayers/*` to iDARMS services | Fine as the read API and registration proxy for iDARMS clients. |
| Ports 3010-3040 | May collide with the CROIP local stack (OPEN_QUESTIONS O12). |
