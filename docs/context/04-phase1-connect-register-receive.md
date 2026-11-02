# Phase 1: Connect, Register, Receive

Read `00-operating-model.md` first. This file is the detail under it.

**Scope of this phase.** How iDARMS (a concessionaire) (1) gets onboarded and obtains credentials, (2) learns which MMDAs it has been assigned and their boundaries, (3) registers ratepayers and properties through CROIP, and (4) receives a downstream copy of ratepayers and properties in its territory. **Billing, payments, receipts, reporting events and reconciliation are out of scope until Phase 1 works.**

Verified against CROIP `toughcoder066/croip` @ `9be15da` (27 Oct 2026, latest `main` on 2 Nov 2026) by reading code. Nothing was run. "Verified" below means seen in source. Re-check before relying on it.

## 1. The target flow (what we are building towards)

```
ONBOARDING (CROIP staff, in CROIP's portal)
  1. Onboard iDARMS            POST /v1/concessions  {name, businessRegistrationNumber, tin, contactName/Phone/Email}
                               -> CROIP creates the concession + a ZITADEL machine user,
                                  returns {clientId, clientSecret} once and emails it to contactEmail
  2. Assign MMDAs              POST /v1/concessions/{id}/assemblies  {assemblyId, contractEnd}
  3. (Do NOT use) CROIP has POST /v1/concessions/{id}/personnel, but staff are onboarded only in iDARMS (00-operating-model.md, O24)

CONNECT (iDARMS, machine to machine)
  4. Get a token               POST {CROIP_ZITADEL}/oauth/v2/token  grant_type=client_credentials
  5. Call CROIP APIs           Authorization: Bearer <token>
     CROIP resolves token -> concession:  GET /v1/api-clients/{client_id}/context  (cached 60 s)
                               -> {concessionId, assemblyIds[], permissions[]}

REGISTER (iDARMS -> CROIP; CROIP is the system of record)
  6. Ratepayer                 POST /v1/ratepayers   (idempotencyKey)
  7. Property                  POST /v1/properties   (idempotencyKey, polygonGeoJson, staffRef)

RECEIVE (CROIP -> iDARMS)        <-- NOT BUILT IN CROIP YET, see gaps G1 to G4
  8. Boundary + assignment     iDARMS learns its assigned MMDAs and their polygons
  9. Downstream copy           iDARMS replica of ratepayers and properties in its MMDAs
```

## 2. Verified facts

### 2.1 Onboarding and credentials (platform-governance-service, :3010)

- Onboarding needs only name, business registration number, TIN and contact details. The code is generated (`CONC-<year>-XXXX-XXXX`) and shown publicly via `GET /v1/concessions/by-code/{code}` (id, code, name, status only).
- `issueApiClient` creates a ZITADEL machine user, stores a row (`clientId`, `status`, `expiresAt` = now + 365 days, `rotatedFromId`), emails the credential, and **returns the secret once** in the onboarding response with an `emailDelivered` flag. A failed email is recorded (`deliveryError`).
- Self-service: `GET /v1/concessions/me/api-clients`, `POST .../rotate`, `POST .../revoke` (permission `api_clients:self_manage`). Rotation leaves the old ZITADEL user deactivated.
- CROIP staff use `POST /v1/concessions/{id}/api-clients/rotate|revoke`.
- MMDA assignment: `POST /v1/concessions/{id}/assemblies` with `contractEnd`. `contractStart` is always "now". Per the schema comments there is at most **one active concession per MMDA** (a hand-written partial unique index in the migration). A concession can hold several MMDAs.
- Deactivating a concession makes its credential resolve to nothing, so every call fails.

### 2.2 How a CROIP service identifies us (every service's `plugins/auth.ts`)

- It verifies the JWT against CROIP's ZITADEL (signature, issuer, audience), reads `client_id`, and calls `GET /v1/api-clients/{clientId}/context` on platform-governance. That endpoint is **unauthenticated by design** (the comment says the clientId is not a secret and no secret is returned).
- Result: `{concessionId, assemblyIds, permissions}`. Cached 60 s per service, so a revocation takes up to about a minute to bite. An unknown, revoked or deactivated client resolves to null and is rejected.
- **The `urn:idarms:context` token-claim approach was abandoned** ("claims never landed in the token for client_credentials"). `zitadel/README.md` says so. CROIP's top-level README section 6 still describes the claim and is stale. iDARMS must **not** expect concession claims inside a CROIP token. The `urn:idarms:context` claim in the golden template is iDARMS's **own** ZITADEL and unrelated to CROIP's.
- Request body for the token (from CROIP's README): `client_credentials` with `scope = openid urn:zitadel:iam:org:project:id:<projectId>:roles urn:zitadel:iam:org:project:id:<projectId>:aud`. The project id is CROIP's, given at onboarding (not documented where).

### 2.3 What a concession credential is allowed to do (the whole list)

`CONCESSION_API_CLIENT_PERMISSIONS` = `api_clients:self_manage`, `properties:manage`, `properties:read`, `ratepayers:manage`, `ratepayers:read`. **Nothing else.**

It therefore **cannot**: read regions or assemblies or boundaries (`reference:read`), list concessions (`concession:read`), read its own assignment (`concessionaires:read`), send messages (`message:send`), ingest events (`gateway:ingest`), or issue bills (`bills:issue`). Postman's "Concession" folder uses a **staff** token (its README says so), so it hides this. Do not trust Postman as proof of what our credential can do.

### 2.4 Registering a ratepayer (ratepayer-service, :3030)

- `POST /v1/ratepayers`, permission `ratepayers:manage`, concession taken from the token. **`password` is required** (min 6, the staff member sets the citizen's login password). Email or phone required. Optional: type (INDIVIDUAL/ORGANIZATION), names or legal name, address, regionId, assemblyId, latitude/longitude or `locationGeo`, `idempotencyKey`.
- National uniqueness is **by phone or email only** (409 if either exists). There is no national ID check.
- The MMDA is derived from latitude/longitude or `locationGeo`, else taken from `assemblyId` in the body. **A concession-registered ratepayer is not checked against the concession's assigned MMDAs** (only properties are).
- A ratepayer row has a single `concessionId`. A registration OTP is created. Event `revenue.ratepayer.registered.v1` is published, with `concessionId` set to the **zero UUID** in the envelope and `phone`/`email` in the payload.
- Same `idempotencyKey` plus different body returns 409. Same key plus same body replays the original response.
- Ratepayers can also self-register against a public concession code (`POST /v1/ratepayers/self-register`) and log in through CROIP (password then OTP). Those ratepayers get that concession's id.
- Update/delete by concession: `PATCH /v1/ratepayers/{id}`, `DELETE /v1/ratepayers/{id}`.

### 2.5 Registering a property (property-registry-service, :3020)

- `POST /v1/properties` (also `/properties/batch`), permission `properties:manage`. Required: `polygonGeoJson`, `propertyUse`, and **`staffRef`** (an opaque string naming the concession's own staff member). Optional: class, building status, tenure, structure, floors, Ghana Post GPS, documents, `accountNumber`, `idempotencyKey`.
- CROIP detects the MMDA from the polygon. It **rejects** a polygon outside the concession's assigned MMDAs, or one straddling more than one MMDA.
- A property starts with **no owner and no name**. A ratepayer later **claims** it (`POST /v1/properties/{code}/claims`, ratepayer token), and only the ratepayer can name it. The concession cannot link a property to a ratepayer. A concession sees the property's code and id.
- `staffRef` is stored for attribution but **not validated** against registered personnel (no lookup found).
- Verification: iDARMS submits (`POST /v1/properties/{id}/verifications`), CROIP staff review. Events published: `property.created`, `verification_submitted`, `verification_reviewed`, `claimed`, `link_severed`, `deleted`, `document_uploaded`.
- Concession updates and deletes are scoped to its own MMDAs.

### 2.6 Downstream. What actually exists

- Every CROIP service **publishes** domain events to the RabbitMQ topic exchange `croip.domain.v1`. **Nothing consumes them.** There are no per-concession queues, bindings, vhosts, credentials or filters. Every inbox helper is unused.
- There is **no event for onboarding, MMDA assignment or removal, deactivation, or credential rotation**.
- There are no ratepayer or property **update** events (property edits are logged in CROIP's own history table only).
- There is **no endpoint** that tells a concession its own assignment, and none that returns boundary polygons to a concession credential (`reference:read` is not granted).
- The portal's "Data Sync Batches" page says the backend has no such resource.

## 3. Gaps, ordered by what blocks us

| # | Gap in CROIP | Effect on iDARMS | What iDARMS does meanwhile |
|---|---|---|---|
| G1 | No way for a concession to read its own assigned MMDAs, contract end dates and boundary polygons. | Cannot validate locally, cannot draw the map, cannot know when scope changes. | Hard-code nothing. Build `BoundaryProvider` interface. Back it with a manual import or a CROIP staff token in dev only. |
| G2 | No downstream delivery of ratepayers and properties. No snapshot, no changes feed, no per-concession queue (O1). | Replica cannot be filled or kept current. | Build the consumer and replica tables behind `CroipSyncSource`. Test with a local fixture feed. |
| G3 | No assignment, scope-change, deactivation or credential events. | Territory changes are invisible. | Poll the boundary provider on a schedule once G1 is fixed. |
| G4 | No update events for ratepayers and properties. | Replica goes stale after the first copy. | Same as G3. Record last-synced version per row. |
| G5 | `GET /v1/properties` and `GET /v1/properties/{id}` and `GET /v1/ratepayers/directory` are **not scoped to the caller's concession or MMDAs**. `/properties` returns the 50 newest nationwide, with no cursor. | Looks like a data leak between concessionaires (Framework: competitors never see each other's customers). Also unusable for a full pull. | **Do not rely on them for our replica.** Report this to CROIP as a security finding. |
| G6 | Ratepayer registration by a concession is not checked against its MMDAs, is keyed only on phone or email, and forces staff to set the citizen's password. | We could create ratepayers outside our territory, create duplicates, and hold credentials we should not. | iDARMS pre-checks the location against our assigned MMDAs before calling. Decide the password question (O19). |
| G7 | Ratepayer events carry a zero concession id and phone/email. No approved field-sharing schedule. | Cannot scope replica by envelope. Privacy exposure. | Scope by `assemblyId`. Store minimum fields (O3). |
| G8 | `staffRef` is not validated against personnel. Staff registration is CROIP-admin only. | Attribution can be spoofed. | Send a stable opaque staff reference from iDARMS HR. Do not rely on CROIP validating it. |
| G9 | CROIP README section 6 is stale about token claims. Token scope string and project id are not documented for onboarding. | Easy to build the wrong auth client. | Follow section 2.2 above. Ask CROIP to fix the README. |
| G10 | Credentials expire 365 days after issue (stored). Enforcement is not verified. No expiry warning event. | Silent outage if enforced. | Track `expiresAt` locally. Alert 30 days before. Rotation is self-service. |

## 4. What iDARMS builds in Phase 1 (nothing for billing)

A `croip-adapter` boundary inside iDARMS (a service or a module, decided in an ADR) with these parts, each behind an interface:

1. **`CroipAuthClient`**: client-credentials token fetch, in-memory cache until shortly before expiry, one refresh in flight, secret read from the secrets manager, never logged. Handles 401 by refetching once. Alarms on `expiresAt` approaching.
2. **`CroipHttpClient`**: base URL per environment, timeouts, retries with backoff and jitter on 5xx and network errors only, never on 4xx. Passes `idempotencyKey` through unchanged. Maps CROIP's problem responses to our error type.
3. **`BoundaryProvider`**: returns assigned MMDAs `{assemblyId, code, name, contractEnd, polygon, status}`. Local cache table with a version. Implementations: `ManualImportBoundaryProvider` (now), `CroipBoundaryProvider` (once G1 is fixed).
4. **Registration proxy** for ratepayers and properties: validate shape, pre-check location against our cached MMDAs, generate the `idempotencyKey` **at capture time**, call CROIP, return CROIP's response including its id. **Never** write the replica from the response. Persist `pending_registrations` (key, payload hash, status, attempts, last error) when CROIP is unreachable and retry with the same key.
5. **Replica tables** `ratepayers_replica` and `properties_replica`: keyed by CROIP id, carries CROIP version and `syncedAt`, **no write path except the sync consumer**. Minimal fields only (O3).
6. **`CroipSyncSource` consumer**: the only writer of the replica. Idempotent (`processOnce`), ordered by version, tolerant of duplicates, dead-letters malformed input. Implementations: `FixtureSyncSource` (tests) now, real one after O1 is decided.
7. **Admin and ops surface**: connection status page (token ok, last successful call, `expiresAt`, assigned MMDAs, replica lag, pending registrations, dead letters).

## 5. Acceptance tests for Phase 1

1. Token fetch and cache: a second call reuses the token. An expired token refetches once. A bad secret surfaces a clear error and no retry storm.
2. A registration with the same `idempotencyKey` retried after a lost response creates one CROIP record and returns the same CROIP id.
3. CROIP unreachable: the registration is stored as pending, replays later with the **same** key, and ends as one record.
4. A property polygon outside our MMDAs is refused locally with a clear message, and CROIP's own rejection is passed through if it slips through.
5. The replica cannot be written by any API route. Only the consumer writes it (test by attempting it).
6. Duplicate and out-of-order sync events leave the replica correct (newer version wins, older ignored).
7. A synced record outside our MMDAs is dropped and logged, never stored.
8. A registration response does not itself populate the replica. The replica fills only from the sync source.
9. Credential rotation: the new secret is used without downtime and the old one is discarded.
10. Cross-tenant: an iDARMS user cannot read another iDARMS tenant's replica rows (iDARMS's own isolation, per the golden template).

## 6. Decisions needed from you (you control both repos)

- **D1. Downstream transport.** (a) A per-concession RabbitMQ queue on its own vhost, fed by a CROIP "sync router" that filters events by assigned MMDA. This matches your stated design but exposes a broker to an external party, and a new subscriber still needs a snapshot. (b) An HTTP **changes feed** with a cursor (`GET /v1/sync/changes?cursor=`) plus a snapshot, filtered to our MMDAs. It solves first load, replay and backfill, and is simpler to secure. **My recommendation: build (b) first, add (a) later as a push optimisation.** Your call.
- **D2. How iDARMS learns boundaries.** My recommendation: `GET /v1/concessions/me` returning the concession, its active MMDA assignments with contract end dates, and polygons, plus assignment-change entries in the sync feed.
- **D3. Scoping fixes** for the unscoped list and get endpoints (G5), before iDARMS goes anywhere near real data.
- **D4. Walk-in ratepayer password** (O19): can staff register a ratepayer without setting a password, with the citizen activating by OTP?
- **D5. One ratepayer, several concessions** (O2): today a ratepayer has exactly one `concessionId`.
