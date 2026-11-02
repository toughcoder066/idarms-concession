# CROIP ⇄ iDARMS integration contract

> Read `00-operating-model.md` first; it wins over this file. CROIP never onboards iDARMS field agents or local staff, and a concession has one or more assemblies (MMDAs).

Last checked against CROIP repo `toughcoder066/croip` @ `9be15da` (27 Oct 2026, still the latest `main` on 2 Nov 2026). Checked by reading the README, `AGENTS.md`, the Postman collection (157 requests), every service's routes and Prisma schema, the gateway and billing services in detail, and the portal's API client and pages. CROIP is under active development: re-verify before relying on any row marked **Verified**, and never assume a row marked **Not found** exists.

Legend: **Framework** = proposed in Framework v1.0 §4 (not necessarily built). **Verified** = present in CROIP code on the date above. **Not found** = searched for and absent.

> **Scope note:** billing, payments, events and reconciliation rows below are **deferred**. For the current phase read `04-phase1-connect-register-receive.md` first. Where this file and `04` disagree, `04` is newer.

## 1. Roles

CROIP is the central oversight authority and the **system of record for ratepayer identity, property identity, concessions and assemblies**. iDARMS is a concessionaire: it owns billing, assessment, collection, receipts, agents and devices inside its concession, and reports them to CROIP. Money movement, refunds and fee deduction by CROIP are out of scope without a separately approved mandate (Framework §1).

## 2. Direction of every interaction

| # | Interaction | Direction | Mechanism | Status |
|---|---|---|---|---|
| 1 | Register ratepayer | iDARMS -> CROIP | `POST /v1/ratepayers` (permission `ratepayers:manage`; optional `idempotencyKey`; `concessionId` taken from token, not body) | Verified |
| 2 | Register property | iDARMS -> CROIP | `POST /v1/properties`, `POST /v1/properties/batch` (optional `idempotencyKey`; body excludes `concessionId`/`actorId`) | Verified |
| 3 | Update ratepayer / property | iDARMS -> CROIP | `PATCH /v1/properties/:id`; ratepayer update route exists (`PATCH /v1/ratepayers/:id`) | Verified (permissions to confirm) |
| 4 | Property verification | iDARMS -> CROIP | `POST /v1/properties/:id/verifications`; review is CROIP-side | Verified |
| 5 | Ratepayer/property **sync copy** to iDARMS | CROIP -> iDARMS | RabbitMQ. CROIP publishes to topic exchange `croip.domain.v1` with keys such as `revenue.ratepayer.registered.v1`, `revenue.property.created.v1`, `revenue.property.verification_reviewed.v1`, `revenue.property.deleted.v1`, `revenue.property.link_severed.v1`, `revenue.property.claimed.v1` | **Producers verified. Per-concession queues, bindings, credentials and filtering: Not found.** See O1 |
| 6a | Report bills and payments, **REST intake** | iDARMS -> CROIP | `POST /v1/bills` (permission `bills:issue`; body `propertyId`, `ratepayerId` as CROIP UUIDs, `billingPeriod`, `amountDue` decimal, `dueDate`, `billType`, `externalBillRef`; unique per `(concessionId, externalBillRef)`; CROIP generates `billNumber`). `POST /v1/bills/{billNumber}/payments` (permission `payments:receive`; `amount` decimal, `externalPaymentRef`, `clientEventId` UUID unique = idempotency, `paidAt`, optional `paidByRatepayerId`). Bills can supersede earlier bills (`supersedesBillId`); payments have `paymentType`. | **Verified.** Used by Postman's "Concession" persona. Limits: the billing route fills `assemblyId` from the token's **first** assembly only (a TODO in the code). No Idempotency-Key header on bills beyond the `externalBillRef` unique key. No property/ratepayer existence check found |
| 6b | Report events, **gateway** | iDARMS -> CROIP | `POST /v1/events`, `POST /v1/event-batches`; CloudEvents 1.0; 202 = durable receipt; dedupe on `eventId` only | **Verified accepting.** CROIP's gateway README says bills and payments do not flow through it, and no service consumes the events it publishes (see section 2b). Which of 6a/6b is the real channel is open: O7 |
| 7 | Check ingestion status | iDARMS -> CROIP | `GET /v1/ingestions/{id}` (scoped to our concession/assembly). Status is only `RECEIVED` today | Verified (gateway path only) |
| 8 | Period control totals | iDARMS -> CROIP | `POST /v1/control-totals` (required: `authorityCode, periodStart, periodEnd, transactionCount, totalAmountMinor, manifestRef`) | Verified |
| 9 | Reference data (authorities, revenue codes, scope) | CROIP -> iDARMS | `GET /v1/reference-data` | Verified (shared-services) |
| 10 | Assemblies / regions | CROIP -> iDARMS | `GET /v1/assemblies`, `GET /v1/regions` | Verified |
| 11 | Messaging (SMS, etc.) | iDARMS -> CROIP | `POST /v1/messages` (required: `recipientRef, channel, templateVersion, idempotencyKey`), `GET /v1/messages/{id}` | Verified. Mandatory vs local fallback undecided (O11) |
| 12 | Receipt verification | iDARMS issues verifiable receipts; CROIP verifies | `GET /v1/receipts/{id}/verification` | Verified |
| 13 | Our exceptions | CROIP -> iDARMS | `GET /v1/exceptions` (scoped; actions need separate permission) | Verified |
| 14 | Independent provider evidence | independent feeds -> CROIP | `POST /v1/provider-evidence` | **Not for iDARMS.** Never call |

Row 6a is what CROIP's billing service, Postman collection and portal use today: CROIP stores its own copy of each concessionaire-issued bill and payment (with `externalBillRef` / `externalPaymentRef` pointing back to us). That matches the agreed model ("iDARMS generates bills and payments, then syncs them to CROIP"). Treat 6a as the **working intake today** and 6b as the Framework's target. iDARMS is still the owner. CROIP's copy exists for assurance. Do not use `POST /v1/payment-links` (CROIP-hosted pay-for-another links) or CROIP's `/me/bills` (ratepayer view of CROIP's copy) for our collection flow without an ADR. CROIP's `GET /v1/bills` and `GET /v1/payments` are its oversight directory, not our API.

## 2b. What CROIP does not do yet (verified absences)

- **No service in CROIP consumes any RabbitMQ message.** Every service has an `inbox.ts` with `processOnce` and an `InboxMessage` table, but nothing calls them. Every service has an outbox worker that publishes to `croip.domain.v1`, and nothing reads from it. So gateway events are stored and published, not processed.
- **Reconciliation is a stub.** `POST /v1/reconciliation/run` records a run with every total set to zero. Nothing compares reported, provider and settlement amounts yet.
- **No concessionaire sync-back.** No per-concession queues, bindings, credentials or filters exist (O1). The portal's "Data Sync Batches" page says "Not available yet" because the backend has no such resource.
- **No update events** for ratepayers or properties (O4). Property update history is stored locally in CROIP and does not emit an event.
- **No mTLS** (O10). **No gateway conflict check**: same event ID with different content just returns the original (the framework requires quarantine).
- Money in CROIP's billing is decimal `(14,2)` and GHS by default, not integer minor units.

Plan for these being built. Do not build iDARMS to depend on behaviour that is on this list.

## 2a. Authentication to CROIP

Machine credentials per concessionaire and per environment, short-lived OAuth tokens, mutual TLS for reporting clients (Framework §4). CROIP issues tokens from **its own** ZITADEL (client-credentials flow); iDARMS has a separate ZITADEL for its own users. Never mix the two issuers or reuse tokens across them. mTLS was **not found** in CROIP code (O10). Credentials live in a secrets manager or environment, never in the repo.

**Correction after code review:** CROIP does not put concession claims in the token. Each service looks the concession up from the token's `client_id` (`GET /v1/api-clients/{clientId}/context`, cached 60 s). See `04-phase1-connect-register-receive.md` section 2.2. CROIP derives the tenant from the credential and checks it against the payload. Still include the Framework §5 business identity fields in every event so CROIP can cross-check. A mismatch is rejected or quarantined, so never "fix" it by changing the credential.

## 2c. Ratepayer-facing behaviour CROIP already has (verified in Postman and code)

- `GET /v1/concessions/by-code/{code}` (public) and `POST /v1/ratepayers/self-register` (public, rate limited 5 per 15 minutes per IP, optional `idempotencyKey`): a ratepayer registers themselves **against a concession code**, so the ratepayer's concession is set from that code.
- Ratepayer login is **CROIP's own**: `POST /v1/auth/login` (password, then OTP), `/v1/auth/verify-otp`, logout, forgot/reset password. This is not ZITADEL. Staff and machine callers use ZITADEL. Who authenticates ratepayers in iDARMS portals is open (O15).
- `POST /v1/ratepayers/claims` and `/v1/properties/{code}/claims`: a ratepayer claims an existing unclaimed property. Property registration is concession-only.
- Concession staff can also `PATCH`/`DELETE` ratepayers and properties they registered. Property deletion is scoped to the concession's own assembly.
- OTP delivery to phones has no real SMS provider yet (the dev response echoes the code). Email goes to a local mail catcher.

## 3. Reporting event envelope (CloudEvents 1.0)

Required by the CROIP gateway today: `specversion` ("1.0"), `id`, `source`, `type`, `time`, `data`. Optional: `subject`, `dataschema`, `datacontenttype`. Event identity is `(source, id)`.

Framework §5 requires the payload to carry: concessionaire ID, concession ID, authority code, jurisdiction code, revenue code; assessment/invoice/payment/receipt IDs namespaced by issuer; currency, gross, fee, net and allocation lines in **integer minor units**; provider ID and reference, channel, payment time, declared outcome; occurred time, local recorded time, aggregate ID and aggregate version; an opaque revenue-account reference; agent/device ID where relevant; and for corrections the original reference, reason, authorisation reference and replacement version.

Minimum event families (Framework §5): `AssessmentCreated/Amended/Cancelled`, `InvoiceIssued/Cancelled`, `PaymentInitiated/Confirmed/Failed/Reversed`, `ReceiptIssued`, `RefundRequested/Approved/Completed`, `SettlementReported/Confirmed`, `AgentStatusChanged`, `DeviceStatusChanged`, `MessageRequested`, `MessageDeliveryUpdated`.

Example (Framework p.13, illustrative values only):
```json
{ "specversion": "1.0", "id": "evt-A-000018", "source": "urn:concessionaire:A",
  "type": "revenue.payment.confirmed.v1", "time": "2026-10-08T13:30:00Z",
  "subject": "payment/pay-A-000041", "datacontenttype": "application/json",
  "dataschema": "urn:revenue:schema:payment-confirmed:1",
  "data": { "concessionaireId": "A", "concessionId": "CN-001", "authorityCode": "AUTH-01",
    "jurisdictionCode": "J-01", "revenueCode": "REV-01", "paymentId": "pay-A-000041",
    "accountRef": "acct-A-008", "currency": "GHS", "grossMinor": 125000,
    "providerRef": "PSP-739", "providerId": "PSP-01", "aggregateVersion": 2,
    "allocations": [{ "invoiceId": "inv-A-021", "minor": 125000 }] } }
```
Use the Framework event type names (`revenue.payment.confirmed.v1` style) for our **internal and gateway** contract until CROIP publishes a schema registry (O8). The REST intake in 6a is not CloudEvents, so the adapter maps our internal event to it. CROIP's *internal* routing keys (`revenue.billing.payment_received.v1`) are a different namespace; do not copy them.

## 4. Reliability rules (Framework §6, mandatory)

1. Local commit and outbox record in the **same** DB transaction.
2. Delivery worker retries with exponential backoff and jitter, keeps the receipt ID, and re-sends the **same** event on a lost acknowledgement.
3. CROIP dedupes. Same `(source, id)` with the same payload returns the original status. Same identity with **different** content must be quarantined as a conflict. CROIP's code does not do this yet (it keys on event ID alone and never compares payload hashes), so **iDARMS must guarantee it never produces that case**.
4. Ordering is per aggregate using `aggregateVersion`. A refund arriving before its payment waits or raises a dependency exception. There is no global sequence.
5. Per period, send a manifest: event counts and financial totals per currency and event family, first/last sequence markers, declared gaps. A heartbeat proves connectivity only, never completeness.
6. Central outage: keep collecting within the approved continuity policy, keep the local outbox, replay throttled and recent-first on recovery. Reporting failure never reverses a payment.
7. Offline field devices: encrypted local storage, unique local references, approved cached concession scope, provisional receipts where electronic confirmation is unavailable, cash needs separate deposit/reconciliation controls.

## 5. Replica rules (CROIP -> iDARMS sync)

- A replica row is keyed by the CROIP ID, carries CROIP's `version`/`aggregateVersion`, and is applied only if the incoming version is newer. Older or duplicate events are no-ops.
- Store **only approved fields**. CROIP's `RatepayerRegistered` event currently carries `phone` and `email`; Framework §8 requires a field-level sharing schedule first (O3). Until approved, do not copy contact data beyond what messaging needs.
- Concession scope: the `RatepayerRegistered` envelope currently carries a zero-UUID `concessionId`, so scope cannot be taken from the envelope (O2). Never ingest ratepayers or properties outside our assemblies.
- Deletions and link severance (`*.deleted`, `*.link_severed`) must be handled. They may not delete financial history. Bills and payments against a removed property remain, flagged.
- Replica tables are read-only to every API route. The consumer is the sole writer.

## 6. Registration request path (iDARMS-side behaviour)

1. Validate shape only. CROIP owns validation of identity and boundaries (it rejects properties outside the concession's drawn assemblies).
2. Generate the `idempotencyKey` **at capture time** (field agents may be offline) and reuse it on every retry. CROIP's endpoints explicitly support this.
3. Call CROIP with the iDARMS machine credential. Return CROIP's response (including the CROIP ID) to the caller.
4. Do not write the replica from the response. The replica catches up from the event. The UI shows "registered, syncing" until it arrives (proposed default, see O6).
5. If CROIP is unreachable: persist the request durably (`pending_registrations`) with its key and retry. Do not invent a local ID that escapes into bills. No billing against a registration that has no CROIP ID yet (proposed default, confirm in O6).

## 7. Suggested internal placement (confirm in an ADR before building)

The Framework's Figure 1 shows each concession with an "adapter and durable outbox". Because the CROIP intake channel is still moving (6a vs 6b), the adapter is where that uncertainty must be contained. A dedicated `croip-adapter-service` in iDARMS would own: the CROIP HTTP client, the sync consumer (CROIP events -> internal events/replica updates), the reporting worker (internal events -> CloudEvents -> CROIP), control-total manifests and ingestion-status tracking. Business services keep their own outbox and never talk to CROIP directly. The audit must report where the existing code already differs from this.
