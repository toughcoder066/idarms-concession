# System context: Framework v1.0 distilled

Source: *Central Platform Architecture and Interoperability Framework*, v1.0, proposed design, 8 Oct 2026 (`docs/source/croip-framework-v1.0.pdf`, text in `.txt`). It is a **draft for consortium and Government review**. Planning numbers are proposals, not commitments. iDARMS is "one potential concessionaire platform" in it. Page numbers below refer to the PDF.

## Model (p.1-2)

Federated: each concessionaire runs its own revenue system inside its authorised concession and reports standardised information to the Central Platform (CROIP). Commitments: concessionaires keep operational control of registration, assessment, billing, collection channels and customer support (**superseded for registration/identity by ADR-0001**); the Central Platform receives durable events and provides monitoring, reconciliation, audit and shared services; a central outage does not normally stop authorised local collection; **central acceptance of a report is distinct from provider confirmation of payment and from bank confirmation of settlement**.

## Responsibility split (p.2, with ADR-0001 applied)

| Function | iDARMS (concessionaire) | CROIP |
|---|---|---|
| Registration and identity | Capture and forward; hold replica | System of record (ADR-0001) |
| Assessment and billing | Apply approved rules, issue bills | Receive assessment versions, monitor totals |
| Collection and receipts | Initiate payments, issue verifiable receipts | Record reported outcomes, verify receipt references |
| Agents and devices | Manage staff, POS, field ops | Validate concession scope, monitor registered identifiers |
| Financial reconciliation | Resolve local payment/settlement issues | Reconcile independent evidence, manage national exceptions |
| Messaging and support | Request messages, handle customers | Shared delivery, monitor escalations |
| Data and reporting | Complete local records, report events | National reporting with completeness indicators |
| Availability and recovery | Queue events, restore local services | Restore ingestion, replay, rebuild national views |

Isolation: a concessionaire sees only its own records plus approved shared references. Competitors never see each other's customers, pricing or operating data. Offline collection uses an approved cached scope with expiry; out-of-scope reports are flagged for investigation, never silently discarded. Refunds, fund movement, fee deduction and commission distribution need a separately approved mandate (p.2).

## Four financial states (p.8)

A **reported** payment, a **provider-confirmed** payment, a **settled** amount and a **reconciled Government credit** are separate states. National reports expose all four. iDARMS can only author "reported". An unmatched difference is an exception until classified, not automatically fraud.

## Data model rules (p.6)

Account, person, property, business and invoice are separate entities. A phone number is a contact channel, not a unique person identifier. Partial payments, one payment against several invoices and several payments against one invoice must work. A failed attempt creates no collected revenue. Refunds, reversals and amendments preserve originals and link compensating entries. Ownership changes preserve historical liability and payment records.

## Interface and transport (p.5)

HTTPS, JSON UTF-8, UTC timestamps with explicit offsets, integer minor units or fixed decimals, currency codes. 202 = durable receipt only. Invalid schema -> explanatory 4xx. Rate limit -> 429 with retry guidance. Transient 5xx and timeouts retry with the **original event ID**. Separate machine credentials per concessionaire and environment, short-lived OAuth tokens, mTLS for reporting clients. OpenAPI and CloudEvents 1.0 pinned. Proposed: 180 days' notice before retiring a breaking version, old and new in parallel.

## Security and privacy (p.9)

Tenant and jurisdiction scope enforced at API, application and data layers; client-supplied concessionaire IDs never override authenticated scope. MFA for privileged users. Minimise shared data; approve a field-level sharing schedule before integration. Test with synthetic or irreversibly de-identified data. Exclude card security codes, full payment credentials and unnecessary ID images from payloads. Append-only archive; partition or tokenise personal fields so retention expiry and deletion do not destroy minimum financial evidence.

## Planning targets, proposals only (p.10)

Central ingestion 99.9% monthly. Connected reporting delay: 95% within 60 s (local commit to central durable receipt). Dashboard freshness: 95% within 5 min. Offline backlog drains within 24 h of stable recovery. Central DR: RPO <= 5 min, RTO <= 4 h. Reconciliation daily. Critical incident acknowledgement 15 min. Partners must retain accepted outbox history for an agreed replay window and compare manifests after failover.

## Mandatory integration tests (p.12). Every one must have an automated test in iDARMS.

1. Duplicate submission and lost acknowledgement cause one business effect.
2. Different payloads with the same event identity are flagged without overwriting evidence.
3. Out-of-order payment, receipt, reversal and refund events resolve consistently.
4. A batch with mixed valid and invalid items returns individual results without silent losses.
5. A concessionaire cannot read or submit records under another's identity.
6. Offline replay and central failover restore completeness against control totals.
7. Partial payments, multi-invoice allocations, fees and settlement batches reconcile correctly.
8. Missing bank evidence, provider delay and unexplained differences appear as open exceptions.
9. Message retry, fallback and callback replay create no unauthorised duplicate notifications.
10. Credential revocation, expired concessions and approved historical reporting behave as specified.

## Concession transition (p.11)

Authority changes are effective-dated. New collection rights freeze at cutover while historical reporting stays permitted. Data and evidence export to Government or a successor, credentials rotate, balances reconcile. Transfer of records does not transfer proprietary software.
