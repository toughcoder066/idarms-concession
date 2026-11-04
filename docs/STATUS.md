# iDARMS build status

Every row needs evidence (file paths, commands run, test output). "Looks implemented" is not a status.

Audit date: 2026-11-02 | Commit audited: `b34a670` **plus an uncommitted working tree** (97 modified, 27 deleted, 89 untracked paths) | Audited by: Claude Code (`/audit`), read-only

Paths are relative to the repo root. `svc/` = `services/`. Nothing was changed except this file and `docs/OPEN_QUESTIONS.md`.

## Commands run

| Command | Result |
|---|---|
| `pnpm typecheck` (turbo, all workspaces) | **13/13 tasks pass**, exit 0 |
| `pnpm test` (turbo) | Exit 0, but **9 of 11 services have no test files** (`vitest run --passWithNoTests`). Tests exist only in `packages/contracts` (3 files, 15 pass), `svc/concessions-management-service` (8 files, 74 pass), `apps/idarms-portal` (5 pass, preview screen). **Zero tests in ratepayer-, property- and croip-integration-service.** |
| Not run | `pnpm dev:all`, `pnpm smoke`, migrations, ZITADEL. They need Docker and would write to local databases; out of scope for a read-only audit. No CROIP instance was contacted. |

## Intent and history

- **Original intent: a fully federated "edge terminal".** *Documented* in `README.md` and `docs/IDARMS_MASTER_SPEC.md`. iDARMS was described as a "replaceable edge terminal" holding a read-only replica of CROIP master data, with field verification, valuation, billing, payments, reconciliation and reporting done locally. "CQRS routing" was a design choice: the **portal writes ratepayers and properties directly to CROIP**, and local events flow up to CROIP over an outbox to RabbitMQ bridge.
- **Build order.** *Documented* in `git log`; every commit is dated 19–20 Oct 2026 and co-authored with Copilot.
  1. `1225e36` scaffold: 9 services from a golden template, portal, compose, 293 files.
  2. `577efdc` replica handlers, `POST /properties/:id/verify`, `scripts/dev/publish-event.mjs` to simulate CROIP.
  3. `b8ec325` sync bridge, valuation→billing→payment→reconciliation→reporting chain.
  4. `7878f0e` `dev:all` and `smoke`.
  5. `5f54737` ZITADEL auth (iDARMS realm and CROIP M2M).
  6. `b34a670` portal server actions for direct CROIP writes.
- **A large uncommitted second wave.** *Documented* by `git status`.
  - **The `concessions-management-service` and `gis-service` are entirely untracked** (`git ls-files` returns 0 files for both), as are ~25 portal routes (`concessions/`, `assembly/`, `gis/`, `sync/`, `preview/` and others).
  - Their migrations are dated 21–23 Oct 2026.
  - The rename `property-registry-service` → `property-service` (`docs/update.md`) is also uncommitted (27 deletions).
- **The governance layer is newer still and also untracked.** *Documented*. It consists of `CLAUDE.md`, `docs/context/`, `docs/decisions/` and this file. ADR-0001 is dated 2 Nov 2026, after all the code was written.
- **The code was built against the pre-ADR model.** *Inferred* from the dates and from README vs ADR-0001. The main differences:
  - Concessions and assemblies are owned locally.
  - Property status is changed locally.
  - A guessed CROIP envelope is used.
  - Money is decimal.
  - A full billing chain was built before Phase 1 was finished.
- **Areas that look half-finished.** *Inferred*.
  - The `croip-integration-service` has no event handlers (`src/events/handlers.ts:13` returns an empty map) and template routes with no tenant filter.
  - Every `aggregateVersion` is hard-coded to 1.
  - There are no tests in any CROIP-facing service.
  - `docs/golden_template.md` and `docs/IDARMS_MASTER_SPEC.md` are modified but uncommitted.
- **Where docs and docs disagree.** *Documented*.
  - ADR-0001 §2 says registration is sent "directly to CROIP's API", which matches the code (portal → CROIP).
  - `CLAUDE.md` §3A and `04` §4 say iDARMS UI → **iDARMS API** → CROIP, through a `croip-adapter` with `pending_registrations`.
  - Raised as O26.

## Repo map

| Unit | Port | Database | Workers | Owned tables (domain) | Routes (read from code) |
|---|---|---|---|---|---|
| `svc/property-service` | 3010 | `idarms_property_db` | outbox, inbox | `properties`, `field_verifications` | `GET /v1/properties`, `GET /v1/properties/:id`, `POST /v1/properties/:id/verify` |
| `svc/ratepayer-service` | 3020 | `idarms_ratepayer_db` | outbox, inbox | `ratepayers` | `GET /v1/ratepayers`, `GET /v1/ratepayers/:id` |
| `svc/billing-service` | 3030 | `idarms_billing_db` | outbox, inbox | bills, `FeeFixingReplica` (DEFERRED) | bills module |
| `svc/payment-service` | 3040 | `idarms_payment_db` | outbox, inbox | `PaymentTransaction`, `BillReplica` (DEFERRED) | checkout, webhook |
| `svc/documents-service` | 3050 | `idarms_document_db` | outbox, inbox | documents (presigned metadata) | documents module |
| `svc/valuation-service` | 3060 | `idarms_valuation_db` | outbox, inbox | valuations, `PropertyReplica` (DEFERRED) | valuations module |
| `svc/reconciliation-service` | 3070 | `idarms_reconciliation_db` | outbox, inbox | discrepancies, bill/payment replicas (DEFERRED) | discrepancies module |
| `svc/reporting-service` | 3080 | `idarms_reporting_db` | outbox, inbox | dashboard metrics (DEFERRED) | dashboard module |
| `svc/croip-integration-service` | 3090 | `idarms_integration_db` | outbox, inbox, **downstream**, **upstream** | `sync_records` | `GET /v1/sync`, `GET /v1/sync/:id` |
| `svc/concessions-management-service` (untracked) | 3100 | `concession_mgmt_db` | outbox, inbox | `concession_contracts`, `assemblies`, `concession_assemblies`, `zitadel_org_contexts`, `assembly_onboardings`, `staff_members`, `staff_import_batches`, `staff_notifications`, lookups, `fee_fixing_bylaws`, `assembly_targets`, `approval_requests`, `agent_assignments` | `POST/PATCH /v1/contracts`, `POST/PATCH /v1/assemblies`, `POST /v1/assemblies/:id/onboard`, rates, target, agents, approvals, staff, audit, org context |
| `svc/gis-service` (untracked) | 3110 | `gis_spatial_db` | outbox, inbox | zones, blocks | zones module |
| `apps/idarms-portal` | 3000 | none | none | none | Next.js 16. Server actions `ratepayers/new/actions.ts` and `properties/new/actions.ts` call CROIP directly via `src/lib/croip.ts` and `src/lib/m2m.ts`. **Since 3 Nov 2026** pages sit in two route groups: `src/app/(auth)/` (login, password, invite, signed-out; no shell) and `src/app/(portal)/` (everything else; its layout refuses to render without a session). Sign-in ends with a full page load to the Auth.js callback (`useSignInRedirect` in `components/auth/auth-forms.tsx`), because a server-action `redirect()` is a soft navigation that left the signed-out shell on screen. |
| `packages/contracts` | | | | | Zod contracts (stand-in for `@croip/contracts`) |
| `infra/docker` | PG 5433, RabbitMQ 5672/15672 | 11 DBs (`postgres-init/01-create-databases.sql`) | | | ZITADEL in `infra/docker/zitadel/` |
| CI | | | | | **None.** No `.github/`, no pipeline files. |

Every service also has `outbox_events`, `inbox_messages`, `audit_records` and `idempotency_records` (template models). All services share the Postgres role `idarms` (isolation by convention only). **Port collisions with CROIP (O12):** 3010, 3020, 3030 and 3050 are CROIP's governance, property, ratepayer and portal ports.

## Legend
Exists = code present. Works = runs and behaves (evidence). Tests = automated tests present and passing. Contract = conforms to `docs/context/02-croip-integration-contract.md`. Status values: `NOT STARTED`, `PARTIAL`, `DONE`, `WRONG MODEL` (built against an old assumption, for example local ownership of ratepayers/properties), `UNKNOWN`, `DEFERRED`.

"Works" is **not verified** for any row: nothing was run against CROIP or a live stack.

## Phase 1: Connect, Register, Receive (current)
| Capability | Status | Exists | Works | Tests | Contract | Evidence / notes |
|---|---|---|---|---|---|---|
| CROIP credential storage and expiry tracking (secrets manager, `expiresAt` alert) | PARTIAL | env only | ? | no | no | `CROIP_CLIENT_ID/SECRET` read from env in two places (`apps/idarms-portal/src/lib/m2m.ts:20-22`, `svc/croip-integration-service/src/config.ts:21-22`). No `expiresAt`, no rotation handling, no alert. |
| `CroipAuthClient` (token fetch, cache, refresh, no secret in logs) | PARTIAL | yes, twice | ? | no | partial | Two copies of the same code: `m2m.ts:18-71` and `svc/croip-integration-service/src/messaging/croip-gateway.ts:44-98`. Both do discovery, client_credentials with the 04 §2.2 scope form, and cache until 30 s before expiry. Missing: single-flight refresh, refetch on 401, expiry alarm. The integration copy **throws unless the token carries `gateway:ingest`** (`croip-gateway.ts:89-91`), which our credential never has (04 §2.3). |
| `CroipHttpClient` (timeouts, retry policy, idempotency key passthrough) | NOT STARTED | timeout only | | no | no | `croip.ts:48-66` `croipPost`: one `fetch` with a timeout. No retries, no `idempotencyKey`, no problem-response mapping. |
| `BoundaryProvider` and assigned-MMDA cache | PARTIAL (slice 2a, 2026-11-02) | yes | yes, local DB | 19 (import 10, dates 5, route 4) | partial | **New:**
- **Table:** `assigned_assemblies` (migration `20261102120000_assigned_assemblies`, applied to the local Docker DB).
- **Lookup:** `BoundaryProvider` + `ManualImportBoundaryProvider` (`svc/croip-integration-service/src/modules/assemblies/boundary-provider.ts`). Contract end is enforced locally, because CROIP never checks it.
- **Import:** operator command `assemblies:import <file> --actor <name>` (`src/scripts/import-assemblies.ts`). It validates the whole file, refuses another concession, treats the file as the full list, marks dropped assemblies REMOVED (never deleted), is idempotent, and audits every run. Verified by real runs against the local DB: create, unchanged re-run, removal, wrong-concession refusal, reactivation.
- **Read endpoint:** `GET /v1/assigned-assemblies` follows ADR-0002 visibility. No write route.

**Not yet:** polygons are stored if supplied but not used; no CROIP-backed provider (G1); nothing consumes the provider yet (slices 2, 6, 7). Previous finding still stands: | No provider. Instead **assemblies and concessions are authored locally**: `svc/concessions-management-service/prisma/schema.prisma:179-237` (`ConcessionContract`, `Assembly` with optional `croipAssemblyId`, `ConcessionAssembly`), written by `POST /v1/contracts` and `POST /v1/assemblies` (`src/modules/concessions/routes.ts:156,234`). No polygons; `gis-service` holds local zones/blocks, not CROIP boundaries. |
| Local location pre-check against assigned MMDAs | NOT STARTED | no | | | no | `croip.ts:72-98` checks only UUID format and lat/long ranges. `assemblyId` comes from the form. |
| Ratepayer registration proxy (idempotency key at capture) | PARTIAL | yes | ? | no | no | `apps/idarms-portal/src/app/ratepayers/new/actions.ts` → `croip.ts:72-108` `POST /v1/ratepayers`. It goes from the portal to CROIP directly, with no iDARMS API (O26). It sends no `idempotencyKey` and no `password`, which CROIP requires (04 §2.4, O19), so the call is probably rejected. It has no pre-check and no pending queue. Good: it does not write the replica. |
| Property registration proxy (polygon, staffRef) | PARTIAL | yes | ? | no | no | `properties/new/actions.ts` → `croip.ts:110-160` `POST /v1/properties`. It sends no `staffRef` (required, 04 §2.5) and no `idempotencyKey`. It adds `code` and `registrationSource:'CONCESSION'`, which are not verified to exist in CROIP. Good: it does not write the replica. |
| `pending_registrations` and retry with the same key | NOT STARTED | no | | | no | grep for `pending_registrations`, `pendingRegistration` and `staffRef` in `apps`, `services` and `scripts` returned nothing. |
| `ratepayers_replica` and `properties_replica` (read-only to routes) | WRONG MODEL | yes | ? | no | no | **`ratepayers`** (`svc/ratepayer-service/prisma/schema.prisma:82-97`): `id` = CROIP id; **no version column**; stores `ghanaCardId`, `phone`, `email` (O3); global `@unique` on `reference` and `ghanaCardId`; single `concessionId`, against O2. Routes are GET-only, which is OK. **`properties`** (`svc/property-service/prisma/schema.prisma:82-126`): local `id` plus **nullable** `croipPropertyId`; local `version` counter; `registeredBy` required with a zero-UUID fallback; `registrationSource` enum; `isBillGenerated` written from `bill.issued.v1` (`property.handler.ts:188-194`); `FieldVerification` `onDelete: Cascade`. **Written from an API route**: `POST /v1/properties/:id/verify` → `service.ts:62-70` sets `status`, `verifiedBy`, `verifiedAt`, `version`. |
| `CroipSyncSource` consumer (idempotent, version-ordered, scope-filtered) | WRONG MODEL | yes | ? | no | no | `svc/croip-integration-service/src/workers/downstream-worker.ts` → `events/relay.ts:10-33` → `idarms.events` → `svc/ratepayer-service/src/events/ratepayer.handler.ts`, `svc/property-service/src/events/property.handler.ts`. Problems: (1) binds exchange `croip.events` with keys `croip.ratepayer.registered.v1`, `croip.property.registered.v1` (`config.ts:18,81`), but CROIP publishes on `croip.domain.v1` as `revenue.ratepayer.registered.v1` / `revenue.property.created.v1` (contract row 5); (2) assumes CROIP's message already has the iDARMS `EventEnvelope` shape (`downstream-worker.ts:25`); (3) scope = `envelope.concessionId !== config.concessionId` (one env UUID, `config.ts:26`), so it **drops all ratepayer events** if CROIP sends the zero UUID (G7), otherwise trusts the envelope; there is **no assembly filter** and no log on drop; (4) **no aggregateVersion ordering** (`ratepayer.handler.ts:24-47` upserts unconditionally; `property.handler.ts:169-181` increments a local counter); (5) no handlers for `deleted`, `link_severed`, `claimed`, `verification_reviewed`; (6) `nack(requeue=true)` with no dead-letter (`downstream-worker.ts:39`), so poison messages loop forever; (7) no `CroipSyncSource` interface; the RabbitMQ transport is hard-wired. Idempotent via `processOnce` (OK). The only "fixture" is `scripts/dev/publish-event.mjs`, which publishes iDARMS-shaped envelopes straight onto `idarms.events`. |
| Connection status and ops page | PARTIAL | yes | ? | no | no | `apps/idarms-portal/src/app/sync/page.tsx` lists `sync_records`. It does not show token health, `expiresAt`, assigned MMDAs, replica lag, pending registrations or dead letters. Backing route `GET /v1/sync` has **no tenant filter** (`svc/croip-integration-service/src/modules/sync/service.ts:8-18`, `where: {}`). |
| Local staff and agents onboarded in iDARMS only; opaque `staffRef` mapping and audit | PARTIAL | staff yes, staffRef no | ? | 74 tests (staff, provisioning, audit) | partial | Staff are managed in iDARMS's own ZITADEL via `svc/concessions-management-service/src/modules/staff/*` and `provisioning/zitadel-client.ts`; the tenancy review found no CROIP HTTP call in that service and no staff PII sent to CROIP. There is no opaque `staffRef` issuance or mapping. `property-service` verify records `agentId = token subject` (`routes.ts:36`). |
| Concession modelled with one or more assemblies (no single-assembly assumption) | PARTIAL | yes | ? | partial | no | The data model is many-to-many (`ConcessionAssembly`). But the request context is one `{concessionId, assemblyId}` per token. ZITADEL orgs are **per assembly** (`ZitadelOrgContext.assemblyId @unique`). Every replica query filters by a single assembly (`ratepayers/service.ts:8-18`). The sync bridge holds one `CONCESSION_ID` and no assembly set. |
| Phase 1 acceptance tests 1 to 10 (spec section 5) | NOT STARTED | no | | 0/10 | | No test files in ratepayer-, property- or croip-integration-service; `pnpm test` reports "No test files found". |

## Deferred (billing phase): do not work on these yet

What exists only. Not assessed for quality.

| Area | Status | What exists |
|---|---|---|
| Valuation | DEFERRED | `svc/valuation-service`: `property.verified.v1` → valuation → `property.valuation_completed.v1`; `PropertyReplica`. |
| Billing | DEFERRED | `svc/billing-service`: `valuation_completed` → bill → `bill.issued.v1`; consumes `fee_fixing.published.v1` into `FeeFixingReplica`. |
| Payments | DEFERRED | `svc/payment-service`: idempotent checkout, HMAC webhook, `payment.collected.v1`, `BillReplica`. |
| Reconciliation | DEFERRED | `svc/reconciliation-service`: bill/payment replicas and local discrepancy detection. |
| Reporting | DEFERRED | `svc/reporting-service`: dashboard aggregation. |
| Fee-fixing, targets, approvals | DEFERRED | `svc/concessions-management-service` rates, targets, dual-control approvals, emits `fee_fixing.published.v1`. |
| Upstream reporting to CROIP | DEFERRED, **wired for real** | `svc/croip-integration-service/src/workers/upstream-worker.ts` → `messaging/croip-gateway.ts:122-160` `POST /v1/events` (channel 6b) for 6 local event types (`config.ts:79`). CLAUDE.md says to stub both channels and ask before wiring one (O7). |

Cross-cutting facts recorded from the deferred code. They are violations of CLAUDE.md §4, to be fixed when billing resumes.
- Money is `Decimal(12|14,2)` and JS `number` everywhere. There are no minor units (`packages/contracts/src/billing.ts:18-25`, `payment.ts:20`, `valuation.ts:10-11`; float arithmetic in `billing.handler.ts:88-90`, `payment-service/.../service.ts:210-215`, `reconciliation.handler.ts:92-101`).
- Financial rows are overwritten in place: `billing.handler.ts:~108-119` bill upsert, and `payment-service/.../service.ts:210-216` `billReplica.amountPaid`. There are no reversal or refund events.
- `payment-service/.../service.ts:128-145` writes the payment with no outbox row in the same tx; `:191-195` sets FAILED outside any tx.
- No audit rows in billing, payment, valuation or reconciliation handlers.
- `aggregateVersion: 1` is hard-coded in every `buildEnvelope` call.
- The upstream relay marks `SYNCED` on HTTP 202 and never polls `/v1/ingestions/{id}` (`outbox.ts:124-144`).
- `reconciliation.discrepancy_detected.v1` is sent up to CROIP, although reconciliation is CROIP's job.

## Platform foundations
| Capability | Status | Exists | Works | Tests | Contract | Evidence / notes |
|---|---|---|---|---|---|---|
| Service template conformance (health, metrics, OpenAPI, env validation) | PARTIAL | yes | ? | no | n/a | Each service has `config.ts` (zod env), `app.ts`, and the `routes/service/policy/schemas` split. README lists `/health/live`, `/health/ready`, `/metrics` and `/docs`, but these were not exercised. |
| ZITADEL token validation and `urn:idarms:context` | PARTIAL | yes | ? | partial (concessions-mgmt context tests) | n/a | `svc/*/src/plugins/auth.ts` (JWKS, issuer, audience). `AUTH_MODE` defaults to `disabled` and is refused only when `NODE_ENV=production` (`croip-integration-service/src/config.ts:41-43`); see T3. Context comes from the org registry, not a claim (T5). No CROIP token claim is read. |
| Tenancy filters (concession + Assembly) and isolation tests | PARTIAL | yes | ? | 13 route tests (ratepayer 5, property 5, croip-integration 3) | partial | **Slice 1a, 2026-11-02:** routes in the 9 template services and the service template now pass `requireTenant`, which returns 403 `tenant_unresolved` unless both ids are resolved (`svc/*/src/plugins/auth.ts`). `TenantScope` fields are required, so an unscoped query no longer compiles. `GET /v1/sync[/:id]` returns 503 `not_available` (`svc/croip-integration-service/src/modules/sync/routes.ts`) and the unscoped `sync/service.ts` was deleted. The tests fail against the old routes (checked). **Slice 1b, 2026-11-02 (ADR-0002):**
- **Reads:** read routes use `requireReadScope`/`readScopeOf` (`svc/*/src/lib/tenancy.ts`). They pass an assembly-specific caller, or **only** a `CONCESSION_SUPER_ADMIN` whose grant is on their home portfolio org. The super admin's queries filter by concession only.
- **Writes:** routes that change data (property verify, payment checkout, GIS zone/block create) keep `requireTenant`, so the super admin cannot act inside an assembly.
- **Concessions management:** `scopeFromAuth` and `canAccessAssembly` (`concessions/context.ts`) no longer widen on scope level alone, and no longer widen when a non-super-admin has no assembly.
- **GIS:** `zones/routes.ts` reads use the same rule. Writes take the assembly only from the token.
- **Super admin capabilities:** `fee_fixing:manage` and `agent:manage` removed (`packages/contracts/src/roles.ts`, synced to every service).
- **Dev mode:** now reads `x-idarms-roles` and `x-idarms-scope-level`.
- **Tests:** 128 pass across the workspace, including the new ADR-0002 cases in ratepayer, property, GIS, contracts and concessions-mgmt.

Still open: event handlers trust envelope tenant ids (T4). The super admin view is not yet narrowed to *currently assigned* assemblies (slice 4). |
| Outbox + worker per service | DONE (pattern) | yes | ? | no | partial | `svc/*/src/messaging/outbox.ts`: written in the business tx; the claim tx (`FOR UPDATE SKIP LOCKED`) commits before publishing, so two workers could double-publish (consumers dedupe). Retries keep the same id. |
| Inbox / `processOnce` | PARTIAL | yes | ? | no | partial | `svc/*/src/messaging/inbox.ts` (unique `(consumerId, messageId)`, same tx); ack after commit. **No dead-lettering**: all workers `nack(requeue=true)`. No envelope validation (`JSON.parse(...) as EventEnvelope`). |
| Idempotency keys on financial commands | DEFERRED | payment checkout only | | | | `IdempotencyRecord` in every schema; used in `payment-service`. |
| Audit records | PARTIAL | yes | ? | concessions-mgmt yes | | Written in `property-service` verify and `concessions-management-service`; missing elsewhere. |
| Docker Compose stack, local ports | PARTIAL | yes | not run | n/a | n/a | `infra/docker/docker-compose.yml` (PG 5433, RabbitMQ 5672). Ports 3010–3110 collide with CROIP (O12). |
| CI pipeline | NOT STARTED | no | | | n/a | No `.github/` or other CI config. |

## CROIP integration
| Capability | Status | Exists | Works | Tests | Contract | Evidence / notes |
|---|---|---|---|---|---|---|
| CROIP HTTP client (auth, retries, idempotency keys) | PARTIAL | see Phase 1 | | no | no | Duplicated in the portal and the integration service; no retries, no idempotency. |
| Ratepayer registration proxy -> CROIP | PARTIAL | portal only | | no | no | See Phase 1. |
| Property registration proxy -> CROIP | PARTIAL | portal only | | no | no | See Phase 1. |
| Pending-registration queue (CROIP unreachable) | NOT STARTED | no | | | | |
| Sync consumer -> ratepayer replica | WRONG MODEL | yes | | no | no | See Phase 1. |
| Sync consumer -> property replica | WRONG MODEL | yes | | no | no | See Phase 1. |
| Replica is read-only to all routes | WRONG MODEL | | | no | no | Ratepayer: yes. Property: **no** (`POST /v1/properties/:id/verify`). |
| Reference-data / assembly cache | WRONG MODEL | local authoring | | | no | `concessions-management-service` authors assemblies and lookups locally. |
| Reporting worker -> CROIP adapter (billing REST intake and/or `/v1/events`, see O7) | DEFERRED | 6b only, wired for real | | no | no | See Deferred. |
| Ingestion status tracking | DEFERRED | no | | | no | `ingestionId` stored in `sync_records.croipReference`, never polled. |
| Control-total manifests | DEFERRED | no | | | | grep `control-totals` found nothing. |
| Exceptions read (own scope) | DEFERRED | no | | | | |
| Messaging via CROIP | DEFERRED | no | | | | |

## Business capabilities (iDARMS-owned)
All DEFERRED except field agents. Existence only.

| Capability | Status | Evidence / notes |
|---|---|---|
| Assessment / valuation | DEFERRED | `svc/valuation-service` |
| Billing / invoices | DEFERRED | `svc/billing-service` |
| Payments (partial, multi-invoice, failed, reversed) | DEFERRED | `svc/payment-service` (no reversal path) |
| Receipts (verifiable, provisional offline) | DEFERRED | none found |
| Refunds / reversals / amendments (append-only) | DEFERRED | none found |
| Payment channels | DEFERRED | provider-agnostic `PaymentTransaction` + HMAC webhook |
| Field agents and devices (offline/online) | PARTIAL | staff + `AgentAssignment` in concessions-mgmt; no device model, no offline capture |
| Customer service | DEFERRED | none found |
| Local reporting | DEFERRED | `svc/reporting-service` |

## Framework mandatory tests (p.12)
| # | Test | Status | Evidence |
|---|---|---|---|
| 1 | Duplicate + lost ack = one effect | NOT STARTED | `processOnce` exists; no test |
| 2 | Same ID, different payload never produced | NOT STARTED | no test; `aggregateVersion` hard-coded to 1 |
| 3 | Out-of-order payment/receipt/reversal/refund | NOT STARTED | no version ordering |
| 4 | Mixed valid/invalid batch | NOT STARTED | |
| 5 | Cross-concession isolation | NOT STARTED | no isolation tests; `/v1/sync` leaks |
| 6 | Offline replay + failover vs control totals | NOT STARTED | |
| 7 | Partial / multi-invoice allocations | DEFERRED | |
| 8 | Open exceptions visible | DEFERRED | |
| 9 | No duplicate notifications | DEFERRED | |
| 10 | Revocation / expired concession | NOT STARTED | |

## ADR-0001 check: code that treats CROIP data as locally authoritative

| File | What it does | Verdict |
|---|---|---|
| `svc/property-service/src/modules/properties/routes.ts:30-52`, `service.ts:40-113` | API route mutates replica `status`, `verifiedBy`, `verifiedAt`, `version`; verification never sent to CROIP (`POST /v1/properties/{id}/verifications`, contract row 4) | WRONG MODEL |
| `svc/property-service/src/events/property.handler.ts:188-194` | `bill.issued.v1` writes `isBillGenerated` on the replica row | WRONG MODEL |
| `svc/property-service/prisma/schema.prisma:83-115` | local PK with nullable `croipPropertyId`; `registeredBy`, `registrationSource`, local `version` | WRONG MODEL |
| `svc/concessions-management-service/prisma/schema.prisma:179-237`, `src/modules/concessions/routes.ts:156,177,234,336` | creates and edits concessions, assemblies and assignments locally (CROIP owns these, CLAUDE.md §2) | WRONG MODEL |
| `svc/concessions-management-service` lookups (`PropertyTypeLookup`, `PropertyUsageLookup`) | local reference/code lists (CROIP owns reference data) | WRONG MODEL (confirm, O27) |
| `svc/ratepayer-service/prisma/schema.prisma:82-97` | single `concessionId`, global unique `reference`/`ghanaCardId` | WRONG MODEL (keying) |

Not violations: ratepayer-service routes are GET-only. The portal registration path does not write the replica.

## Placement versus contract §7 (CROIP adapter)

- **CROIP calls happen in three places, not one adapter:**
  - Portal registration: `apps/idarms-portal/src/lib/croip.ts`, `m2m.ts`.
  - Integration-service upstream: `croip-gateway.ts`.
  - Integration-service downstream: `downstream-worker.ts`.
  - The token code is duplicated.
- **The portal holds the CROIP client secret** (Next.js server env) and calls CROIP from server actions. §7 and `04` §4 place this in a `croip-adapter` behind `CroipAuthClient` and `CroipHttpClient`.
- **The `croip-integration-service` is a relay, not an adapter.** It re-publishes events with a `croip.` prefix between two exchanges. It has no interfaces (`CroipSyncSource`, `BoundaryProvider`), no stubs, no ingestion tracking and no manifests.
- **Business services do not call CROIP directly** (OK). They emit internal events that the relay forwards.

## Findings from audit

Ordered by risk.

**Money correctness (all in deferred code; do not fix this phase)**
1. No integer minor units; floats in contracts, events and arithmetic. Details under Deferred.
2. Financial rows overwritten in place; no reversals.
3. `payment-service` writes payments without an outbox row in the same tx.

**Tenancy leaks**

T1. **FIXED in slice 1a (2026-11-02) for the 9 template services; see the tenancy row above.** **The tenant filter disappears when the tenant context is unset (critical).** In the auth plugin, `concessionId` and `assemblyId` are `context?.concessionId`. They become `undefined` when `resolveOrgContext` returns null:
- `svc/*/src/plugins/auth.ts`, e.g. `ratepayer-service/src/plugins/auth.ts:95-106`.
- `resolveOrgContext` returns null on 404, non-OK, timeout or exception (`src/lib/org-context.ts:15-40`).

Prisma drops `undefined` keys, so `where: { concessionId, assemblyId }` matches **every tenant's rows**. GET routes do not reject a missing context. This affects:
- `ratepayer-service/src/modules/ratepayers/service.ts:8-18`
- `property-service/src/modules/properties/service.ts:10-20`
- the same pattern in billing, payment, documents, valuation, reconciliation and reporting.

Only `gis-service` fails closed (`zones/service.ts:9`). Found by the tenancy review; the auth path was re-read and confirmed.

T2. **The portal registration server actions have no authorisation check.** They call CROIP with the shared machine credential for any logged-in user (`apps/idarms-portal/src/app/ratepayers/new/actions.ts`, `properties/new/actions.ts`). The middleware only requires a session. The `assemblyId` comes from the client form.

T3. **`AUTH_MODE` defaults to `disabled`, and the only guard is `NODE_ENV=production`** (`svc/*/src/config.ts`, e.g. `ratepayer-service/src/config.ts:11,32`). In disabled mode, the tenant and permissions are taken from `x-idarms-*` request headers (`plugins/auth.ts:111-121`).

T4. **Replica handlers look up rows by id only**, and on update they overwrite `concessionId`/`assemblyId` from the event (`property.handler.ts:169-176`, `ratepayer.handler.ts:24-47`). A foreign or forged event can move a row to another tenant.

T5. **`/v1/org-context` is public and unauthenticated.** Every service trusts it over plain HTTP for tenancy (`concessions-management-service/src/plugins/auth.ts:34`, `svc/*/src/lib/org-context.ts:21`). It caches nulls for 5 minutes.

T6. **The dev bootstrap creates a `croip-m2m` user inside iDARMS's own ZITADEL** and points `CROIP_ZITADEL_ISSUER` at it (`scripts/dev/zitadel-bootstrap.mjs:392-418,477-485`). The `CROIP_M2M` role grants `integration:sync` on iDARMS (`concessions-management-service/src/lib/roles.ts:271`). This blurs the two auth realms.

Lower, recorded:
- `infra/docker/zitadel/zitadel.env` is tracked and holds dev master key and passwords (names only).
- `apps/idarms-portal/src/lib/preview-session.ts:17` falls back to a hard-coded secret.
- The portal session returns `accessToken`/`idToken` to browser JS (`apps/idarms-portal/src/auth.ts:196-197`).
- The payment webhook HMAC is optional (deferred, `payment-service/src/modules/payments/routes.ts:61-82`).

Verified OK by the tenancy review:
- JWKS, issuer and audience are verified with `jose`.
- No code reads `urn:idarms:context` from a CROIP token.
- iDARMS and CROIP ZITADEL config are kept separate.
- No staff PII and no staff records are sent to CROIP.
- Staff and agents are created only in iDARMS's ZITADEL.

4. **FIXED in slice 1a (closed with 503 until rebuilt).** `GET /v1/sync` and `/v1/sync/:id` return every `sync_records` row regardless of the caller's concession or assembly (`svc/croip-integration-service/src/modules/sync/service.ts:8-18`).
5. The sync bridge scopes by trusting the envelope `concessionId` against one env value, with no assembly filter (`downstream-worker.ts:27`). Replica handlers write `event.assemblyId` unchecked (`ratepayer.handler.ts:29`, `property.handler.ts:152`). Acceptance test 7 is not met.
6. Ratepayer `reference` and `ghanaCardId` are globally unique, not scoped. A collision becomes a poison message that loops forever, because there is no DLQ.

**Data ownership**

7. Property replica is mutated by an API route (`verify`) and by `bill.issued.v1`; verification is not sent to CROIP.
8. Concessions, assemblies and lookups are authored locally in `concessions-management-service`, instead of consumed from CROIP.
9. Ratepayer replica stores `ghanaCardId`, `phone`, `email` without an approved sharing schedule (O3).

**Everything else**

10. The downstream consumer cannot receive real CROIP events: wrong exchange, wrong routing keys, and an assumed envelope shape. There is no version ordering and no delete/sever handling.
11. Registration has no `idempotencyKey`, `staffRef`, password or pre-check, and no pending queue. Retries can duplicate national records. Property and ratepayer calls are probably rejected by CROIP today (not run).
12. The upstream gateway worker is wired for real. It requires `gateway:ingest`, which our credential lacks, so every upstream event retries forever.
13. There are no tests at all in ratepayer-, property- and croip-integration-service. There is no CI.
14. About 90 untracked paths, including two whole services, exist only in this working copy. **Risk of loss.** It also means this audit is not reproducible from any commit.
15. Ports collide with CROIP's stack (O12).

## Next slices (ordered)

Each slice is small enough for one session. Owner approves before starting.

1. **DONE 2026-11-02.** The working tree was committed as-is on branch `wip/pre-audit-snapshot` (`b36a156`). Nothing was pushed.
1a. **DONE 2026-11-02 (with a change of plan): `/v1/sync` is closed (503) instead of migrated, because the relay table is likely to be replaced in slice 2.** Fail closed on missing tenant context (T1) and fix `/v1/sync` scoping. Steps:
   - Add a shared guard that returns 403 when `concessionId` or `assemblyId` is unresolved.
   - Apply it in the ratepayer, property and croip-integration services first.
   - Add a cross-tenant and an unresolved-context test per route.
   - Add tenant columns to `sync_records` (that needs a new migration, so plan first).
   - Depends on: nothing. **Recommended first code slice.**
1b. **DONE 2026-11-02.** The concession super admin gets a read-only view across their concession's assemblies; every other role stays assembly-specific (ADR-0002). Follow-ups:
   - Route-level tests for the rates and agents refusal in concessions-mgmt. The refusal is enforced by the role lists and capabilities and covered by the contracts test.
   - `rates.ts` `requestedAsSupport` labelling is now reachable only by users who hold both the super admin and finance roles.
   - Show assembly names (not ids) in the portal's aggregated lists.
2a. **DONE 2026-11-02 (moved ahead of slice 2 by the owner).** Assigned-assembly list and `BoundaryProvider` with a manual import; see the Phase 1 row. This covers slice 4 except polygons in use and the CROIP-backed provider.
2. **Replica guard and fixture source (ratepayer).** **Now informed by CROIP's real code (O28 answered):**
   - The ratepayer stream is `croip.domain.v1` with keys `revenue.ratepayer.registered.v1` and `revenue.ratepayer.deleted.v1`.
   - The envelope uses `eventId`/`data`.
   - The registered event carries only id, code, phone and email.
   - `aggregateVersion` is always 1.

   So "newer version wins" must be designed around that (O30). Steps:
   - Add a CROIP version column.
   - Apply only newer versions.
   - Scope by an assigned-assembly set (not the envelope), and drop and log the rest.
   - Dead-letter malformed input.
   - Add a `CroipSyncSource` interface with `FixtureSyncSource`.
   - Tests for acceptance 5, 6, 7 and 8.
   - Depends on: O2 and O3 (proposed defaults), O17 (interface only).
3. **Same for properties.** Steps:
   - Key by `croipPropertyId` (non-null).
   - Remove the route and `bill.issued` writes to the replica (move local verification into its own table).
   - Handle `deleted` and `link_severed` without cascading history.
   - Depends on: O4, O26.
4. **`BoundaryProvider` with `ManualImportBoundaryProvider`.** An assigned-MMDA cache table (assemblyId, code, name, contractEnd, polygon, status, version), read-only to routes. It feeds slices 2 and 3. Depends on: O18, O27.
5. **`CroipAuthClient` + `CroipHttpClient` in one adapter module.** One copy, single-flight refresh, refetch on 401, `expiresAt` tracking, retries on 5xx only, `idempotencyKey` passthrough. Tests for acceptance 1 and 9. Depends on: O21, O26.
6. **Property registration proxy through the iDARMS API.** Steps:
   - Generate the key at capture.
   - Issue an opaque `staffRef` and map it to staff and device in the audit.
   - Pre-check against `BoundaryProvider`.
   - Add `pending_registrations`.
   - Tests for acceptance 2, 3 and 4.
   - Depends on: O6, O22, O26.
7. **Ratepayer registration proxy.** Same as slice 6, plus the password question. Depends on: O19, O26.
8. **Fix tenancy leak on `/v1/sync`** and add isolation tests (acceptance 10). Small; could go first if preferred.
9. **Stop the upstream worker for real CROIP**: put the 6a and 6b channels behind a stub until O7 is answered. Config/flag only, no billing work.
10. **Connection status page** (token health, `expiresAt`, assigned MMDAs, replica lag, pending, dead letters). Depends on slices 4–6.
