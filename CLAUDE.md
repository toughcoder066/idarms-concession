# iDARMS: project instructions for Claude Code

iDARMS is **one concessionaire's** revenue collection platform. Its concession covers **one or more assemblies (MMDAs)**. It bills ratepayers and collects payments for properties inside its assigned territory, and it **reports to CROIP**, the national oversight platform. iDARMS is not CROIP. Do not build CROIP features here.

**Read `docs/context/00-operating-model.md` first. It is the definitive model and wins over every other source.** In short: CROIP owns ratepayer, property and concessionaire data and does oversight; iDARMS registers through CROIP, holds a synced read-only copy, generates bills, collects payments, and onboards its own field agents and staff locally (CROIP never knows them).

Status of the codebase is **unknown until `docs/STATUS.md` says otherwise**. Existing code is evidence of what was built, not evidence of what is correct. Audit before you build.

## 0. Current phase: "Connect, Register, Receive" (billing is OUT of scope)

Work only on: (1) iDARMS onboarding and credentials with CROIP, (2) learning assigned MMDAs and boundaries, (3) registering ratepayers and properties through CROIP, (4) receiving the downstream replica. The detailed spec, verified facts and CROIP gaps are in `docs/context/04-phase1-connect-register-receive.md`. **Do not build, change or extend billing, payments, receipts, reporting events, control totals or reconciliation in this phase.** If existing code does those, leave it alone and note it in `docs/STATUS.md`. Flow B below is kept only as the later design.

## 1. Order of authority (when sources disagree)

1. The owner's instructions in the current session, `docs/context/00-operating-model.md`, and `docs/decisions/` (ADRs; ADR-0003 replaces the guide's `urn:idarms:context` claim).
2. `docs/context/02-croip-integration-contract.md`: the CROIP ⇄ iDARMS contract (imported below).
3. CROIP Framework v1.0, 8 Oct 2026 (`docs/source/croip-framework-v1.0.txt`): a **proposed design**, not an implemented spec. Where ADR-0001 differs from it, ADR-0001 wins.
4. iDARMS Golden Template Guide v1.0 (`docs/source/idarms-golden-template-guide-v1.0.md`, distilled in `docs/context/03-golden-template-rules.md`): how every service is built.
5. CROIP repository code: what exists today. It lags the design and is still moving.

If you cannot resolve a conflict from this list, **stop and ask**. Write the question to `docs/OPEN_QUESTIONS.md`. Never invent a CROIP endpoint, event type, field or behaviour.

## 2. Who owns what (single source of truth)

| Data / capability | Authoritative owner | iDARMS role |
|---|---|---|
| Ratepayer identity | **CROIP** (national database) | Read-only **replica** of ratepayers in our concession(s). Fed by CROIP events. |
| Property identity | **CROIP** (national database) | Read-only **replica** of properties in our concession(s). Fed by CROIP events. |
| Concession, assemblies, scope, API credentials, reference/code lists | **CROIP** | Consume only. Never edit. |
| Assessments, bills, invoices | **iDARMS** | Owner. Report to CROIP for assurance. |
| Payments, receipts, refunds, reversals | **iDARMS** | Owner. Report to CROIP. |
| Collection channels, POS/devices, customer service | **iDARMS** | Owner. |
| Field agents, supervisors, all local staff and their roles | **iDARMS** (own ZITADEL) | Owner. **Never onboarded in CROIP.** CROIP sees only an opaque staff reference. |
| Provider/bank/settlement evidence, reconciliation, exceptions, fraud rules, national KPIs, national audit | **CROIP** | Never write. May read own scoped results. |

Ratepayer and property **registration still happens through iDARMS screens and APIs**, but iDARMS does not store the record as its own. It forwards the command to CROIP. CROIP commits it and assigns the canonical ID. CROIP then emits an event, and iDARMS stores a copy.

## 3. The three flows

**A. Registration (ratepayer / property). Command goes up, copy comes back down.**
```
iDARMS UI/agent -> iDARMS API -> CROIP API (POST, idempotencyKey) -> CROIP commits, assigns ID
CROIP event (RabbitMQ) -> iDARMS inbox consumer (processOnce) -> replica row keyed by CROIP ID
```
iDARMS writes ratepayer/property rows **only** from the consumer. Never from the registration request path.

**B. Billing and payment reporting. DEFERRED, not this phase. iDARMS is authoritative, CROIP assures.**
```
iDARMS txn { business row + audit + outbox event }  (one DB transaction)
outbox worker -> CROIP adapter -> CROIP intake channel (see below)
per period -> POST /v1/control-totals
```
**The CROIP intake channel for bills and payments is not settled (OPEN_QUESTIONS O7).** Two exist in CROIP today:
1. **Billing REST intake (the one CROIP's own docs and Postman use):** `POST /v1/bills` (CROIP property/ratepayer UUIDs, `externalBillRef` = our bill ID, decimal `amountDue`) and `POST /v1/bills/{billNumber}/payments` (`externalPaymentRef`, `clientEventId` UUID as the idempotency key, `paidAt`).
2. **Event gateway (the Framework's design):** `POST /v1/events` / `/v1/event-batches`, CloudEvents 1.0, 202 = durable receipt, poll `GET /v1/ingestions/{id}`. CROIP's gateway README says bills and payments do **not** go through it, and nothing in CROIP consumes gateway events yet.

Our internal event contract stays Framework-shaped and channel-independent. Only the CROIP adapter knows which channel is live. Do not call either channel from a business service. Until O7 is answered, build and test the adapter against a stub of both and ask before wiring one for real.

**C. Reference and oversight reads.** `GET /v1/reference-data`, `GET /v1/exceptions` (scoped to us), receipt verification. Cache reference data with its version.

Two RabbitMQ roles exist. Do not mix them. (1) iDARMS's own internal broker between its microservices. (2) The CROIP -> iDARMS sync channel, whose transport is **not finalised** (see OPEN_QUESTIONS O1). Build the consumer behind an interface so the transport can change.

## 4. Hard rules (never break these)

- **Never** create or edit authoritative ratepayer/property data locally. Replica rows come from CROIP events only, applied with `aggregateVersion` ordering.
- Key all cross-system references by **CROIP-issued IDs** (`croipRatepayerId`, `croipPropertyId`, CROIP assembly IDs). Local codes are secondary. A phone number is a contact channel, not a person identifier.
- **CROIP tokens carry no concession claim.** CROIP identifies us by `client_id` through its own lookup. Never build iDARMS to read tenancy from a CROIP token. iDARMS's own tokens carry no concession claim either: tenancy comes from the home-organisation claim through the org registry (ADR-0003).
- **A CROIP credential can do very little** (properties and ratepayers manage/read, API-client self-management). It cannot read boundaries or reference data. Never assume a CROIP endpoint works for us because Postman or the README shows it. Check `docs/context/04-phase1-connect-register-receive.md` section 2.3.
- **Never use CROIP's unscoped list endpoints** (`GET /v1/properties`, `GET /v1/ratepayers/directory`) to build the replica. They are not scoped to us (spec gap G5).
- **Never assume one assembly.** A concession has one or more assemblies and the set changes over time. Scope by concession and assembly everywhere.
- **Local people are local.** Never create field agents or staff in CROIP, and never send staff PII to CROIP. Send only the opaque staff reference.
- **Two organisational scopes, and ZITADEL's default org is not a tenant** (ADR-0003 decision 7). The dedicated concession org is registered as `CONCESSION` (our concession id, no assembly) and is the home org of concession-wide users. Each assembly org is registered as `ASSEMBLY` (same concession id, its assembly id). ZITADEL's default org is identity infrastructure: never register it, never put iDARMS staff in it. There is no `PORTFOLIO` scope. Never hard-code org ids or fall back to guessing a tenant; resolve it from the org registry.
- **Tenant context comes from the verified token**, never from a request body, query string or event payload (`request.auth.concessionId` / `assemblyId`). Every query filters by both. No admin bypass without an approved oversight use case.
- **Transactional outbox only.** Never publish to RabbitMQ or call CROIP inside a business transaction. Business row, audit record and outbox event commit together.
- **Event IDs are stable.** A retry re-sends the **same** event ID and payload. Never create a new financial event to retry. Never reuse an ID with different content. Derive the CROIP event ID deterministically from the internal event ID so replays cannot mint new IDs.
- **Money** is integer minor units plus ISO currency code inside iDARMS. No floats, ever. CROIP's billing REST intake takes decimal amounts (`Decimal(14,2)`), so convert **only in the adapter**, with exact integer arithmetic and a test for rounding (for example 125000 minor = 1250.00).
- **Corrections append, never overwrite.** Reversals, refunds and amendments are new linked events that reference the original. No hard delete of financial history.
- Consumers are idempotent (`processOnce`), ack only after commit, and dead-letter malformed events.
- **HTTP 202 from CROIP means received, not accepted.** Track per-item status. A reporting failure never reverses a payment.
- A bill may only be issued for a property and ratepayer that exist in the replica (policy for unverified properties: OPEN_QUESTIONS O5).
- Keep card security codes, full payment credentials and ID-document images out of events, logs and audit metadata.
- iDARMS never submits to CROIP `/v1/provider-evidence` (restricted to independent feeds) and never marks its own reports as "confirmed by provider/settled". Those states are CROIP's.
- Auth is never disabled in production. Do not edit a migration already applied to a shared environment. Do not run `docker compose down -v`, `prisma migrate reset` or `prisma db push`.
- Secrets never enter the repo. `.env.example` lists variable names only.

## 5. Tech baseline (from the golden template)

Node 24, Fastify 5 + TypeScript, Prisma + PostgreSQL (**one database per service**, no cross-service table access), ZITADEL JWT/JWKS validation (identity, home organisation `urn:zitadel:iam:user:resourceowner:id` and organisation-bound role grants; the org registry maps the home organisation to `{concessionId, assemblyId, scope}` with scope `CONCESSION` or `ASSEMBLY`; no `urn:idarms:context` claim, ADR-0003), RabbitMQ, Docker Compose. Each service has its own outbox worker, inbox/`processOnce`, audit and idempotency models, `/health/live`, `/health/ready`, `/metrics`, OpenAPI. Layout per service: `routes.ts` (transport), `service.ts` (rules + transaction), `policy.ts`, `schemas.ts`. Routes never hold business logic.

Commands (confirm they exist in `package.json`): `npm run typecheck`, `npm test`, `npm run build`, `npm run prisma:generate`, `npm run prisma:deploy`, `npm run worker:outbox`.

## 6. How to work in this repo

- **Plan first** for anything that touches a migration, an event/API contract, tenancy, or more than three files. Show the plan, wait for approval.
- Work in **small vertical slices**. One slice = one capability end to end (schema, route, service, event, tests, docs).
- **Definition of done** (guide §13): business criteria met, authorisation and tenancy tests, API + event contracts, migration reviewed, audit evidence, metrics, docs, recovery steps. "It ran locally" is not done.
- Every slice that touches CROIP gets a contract test: envelope, idempotency/duplicate, retry with the same ID, out-of-order, and cross-tenant attempt.
- After each slice: update `docs/STATUS.md`, add any new unknowns to `docs/OPEN_QUESTIONS.md`, and propose a commit message. Do not commit or push unless asked.
- If something in the repo contradicts this file, report it. Do not silently "fix" it.
- Local ports: CROIP's stack uses 3001-3030 and the guide's examples use 3010-3040. Check for collisions before running both locally (OPEN_QUESTIONS O12).

## 7. Reference map (read on demand)

- `docs/context/01-system-context.md`: Framework distilled (responsibilities, 4 financial states, event families, mandatory tests, SLAs).
- `docs/context/03-golden-template-rules.md`: template rules, plus where the guide's examples diverge from ADR-0001.
- `docs/decisions/ADR-0001-croip-source-of-truth.md`: why registries live in CROIP.
- `docs/source/`: the original PDF, architecture diagram and guide. Quote from these, do not paraphrase from memory.
- `docs/CLAUDE_CODE_PLAYBOOK.md`: the owner's step-by-step prompts and session routine.

@docs/context/00-operating-model.md
@docs/context/04-phase1-connect-register-receive.md
@docs/context/02-croip-integration-contract.md
@docs/STATUS.md
@docs/OPEN_QUESTIONS.md
