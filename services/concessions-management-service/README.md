# concessions-management-service

iDARMS microservice. Owned database: `concession_mgmt_db` (HTTP port `3100`).

## Routes

- `GET /v1/contracts` — list the concession contract (`assembly:read` / `concession:read`)
- `GET /v1/contracts/:id` — fetch the contract (`assembly:read` / `concession:read`)
- `POST /v1/contracts` — create the contract (`concession:manage`)
- `PATCH /v1/contracts/:id` — update revenue split and term (`concession:manage`)
- `GET /v1/assemblies` — list assemblies with onboarding state (`assembly:read` / `concession:read`)
- `GET /v1/assemblies/:id` — assembly profile and readiness inputs (`assembly:read` / `concession:read`)
- `POST /v1/assemblies` — onboard an assembly (`concession:manage`)
- `POST /v1/assemblies/:id/onboard` — idempotent local ZITADEL org provisioning (`CONCESSION_SUPER_ADMIN` / `PLATFORM_ADMIN`)
- `GET /v1/access-directory/assemblies` — live super-admin grant query with a 15s cache (`concession:read` / `directory:read`)
- `GET /v1/assemblies/:assemblyId/staff` — assembly staff directory
- `POST /v1/assemblies/:assemblyId/staff/invite` — invite one staff member
- `POST /v1/assemblies/:assemblyId/staff/bulk-import/validate` — validate CSV/JSON without writing
- `POST /v1/assemblies/:assemblyId/staff/bulk-import/commit` — commit a validated batch
- `GET /v1/assemblies/:assemblyId/staff/bulk-import/:batchId` — retrieve a persisted batch result
- `PATCH /v1/assemblies/:assemblyId/staff/:userId` — change one staff role
- `POST /v1/assemblies/:assemblyId/staff/:userId/deactivate` — deactivate and revoke sessions
- `POST /v1/assemblies/:assemblyId/staff/:userId/reactivate` — reactivate a staff member
- `POST /v1/assemblies/:assemblyId/staff/:userId/resend-invite` — resend an INITIAL invite
- `GET /v1/assemblies/:assemblyId/staff/notifications` — Super Admin transparency rows
- `PATCH /v1/assemblies/:id` — update identifiers, status, branding and administrator (`assembly:manage` / `concession:manage`)
- `GET /v1/assemblies/:id/rates?fiscalYear=` — rate matrix with prior-year comparison (`fee_fixing:read`)
- `PUT /v1/assemblies/:id/rates` — upsert a draft matrix (`fee_fixing:manage`)
- `POST /v1/assemblies/:id/rates/submit` — create a dual-control approval request (`fee_fixing:manage`)
- `GET /v1/assemblies/:id/target?fiscalYear=` — annual target (`assembly:read` / `concession:read`)
- `PUT /v1/assemblies/:id/target` — set annual target (`target:manage`)
- `GET /v1/assemblies/:id/agents` — agent assignments (`agent:manage`)
- `POST /v1/assemblies/:id/agents` — assign an agent (`agent:manage`)
- `DELETE /v1/assemblies/:id/agents/:agentId` — remove an assignment (`agent:manage`)
- `GET /v1/approvals?status=` — approval inbox (`approval:read`)
- `POST /v1/approvals/:id/approve` — approve and publish rate matrix (`approval:manage` / `fee_fixing:publish`)
- `POST /v1/approvals/:id/reject` — reject and return rates to draft (`approval:manage`)
- `GET /v1/audit` — immutable concessions audit ledger (`audit:read`)
- `GET /v1/lookups` — property type and usage catalogue (`assembly:read` / `concession:read`)

## Guardrails

- Rate matrices are editable only in `DRAFT`. Submission moves rows to `PENDING_APPROVAL`.
- Approval requires a different actor from the submitter (dual control).
- `CONCESSION_SUPER_ADMIN` cannot publish MMDA rates; only an `ASSEMBLY_ADMIN` may approve.
- Publishing emits one `fee_fixing.published.v1` event per rate row inside the same
  transaction as the approval decision, through the outbox.
- Every write appends an immutable `AuditRecord` with a human-readable description.
- A `CONCESSION_SUPER_ADMIN` whose home org is the CONCESSION-scoped org can read all
  assemblies in the concession; assembly-scoped callers are restricted to their assembly org.

## Seed local data

```bash
Copy-Item .env.example .env
pnpm prisma:generate
pnpm prisma:deploy
pnpm prisma:seed
```

The seed is idempotent and creates the dev concession contract, property-type lookups,
and two sample assemblies (AMA and LADMA) for local UI work.

## Local ZITADEL assembly onboarding

**Scope lock:** the provisioning client refuses any host other than `localhost`,
`127.0.0.1`, or `[::1]`. All work in this repository is local-only until explicitly
changed.

Export the local first-instance admin key once (it is written to gitignored `.secrets/`):

```bash
pnpm zitadel:export-key
```

Required local environment:

```text
ZITADEL_PROVISIONING_URL=http://localhost:8080
ZITADEL_PROVISIONING_KEY_PATH=../../.secrets/zitadel-admin-sa.json
ZITADEL_PROJECT_ID=<local iDARMS project ID>
ZITADEL_PROJECT_OWNER_ORG_ID=<ZITADEL default org ID: owns the iDARMS project, never a tenant>
ACCESS_DIRECTORY_CACHE_TTL_MS=15000
```

Onboarding needs the concession org to be registered first (409
`concession_org_unregistered` otherwise); see "Organisations and the org registry" below.

`POST /v1/assemblies/:id/onboard` runs a durable saga:

1. Create the assembly's ZITADEL organization using the real assembly name.
2. Grant the iDARMS project to that org. The grant includes every assembly-scoped
   role **and** `CONCESSION_SUPER_ADMIN`; ZITADEL rejects an external super-admin
   grant unless that role is part of the target org's project grant.
3. Add an external `CONCESSION_SUPER_ADMIN` user grant in the new org for every
   existing super admin found in the concession org (looked up in the org registry).
4. Optionally invite the first `ASSEMBLY_ADMIN` and grant that role.
5. Upsert `zitadel_org_contexts` (`scope=ASSEMBLY`, `status=ACTIVE`) and set
   `assemblies.zitadel_org_id`.
6. Invalidate the Access Directory cache for the affected super admins.

Every step writes an `audit_records` row. The saga state is stored in
`assembly_onboardings` keyed by `assembly_id`; a retry deletes the prior partial org
and restarts cleanly, while a fully provisioned assembly returns
`alreadyProvisioned: true` without creating a duplicate org. Any failure after org
creation attempts to delete the org and the registry row; if ZITADEL deletion fails,
the row is marked `FAILED` and the org ID is retained for manual cleanup/retry.

The first admin invite creates a ZITADEL user without a password and emails a
ZITADEL invite code whose link opens the portal's `/invite/accept` page (`PORTAL_URL`,
ADR-0004); the user is created with `returnCode`, so ZITADEL sends no email of its own.
Resending an invite issues a new code with the same link. Local development has no
SMTP, so the invite email is not delivered until ZITADEL is given an SMTP server.

`GET /v1/access-directory/assemblies` derives the caller's assembly set from live
per-org user grants, not the cached token role claim. Results are cached per user and
project for 15 seconds, and provisioning invalidates the affected entries
synchronously so a new assembly appears without re-login.

## Staff management (local)

All staff endpoints resolve the assembly's `zitadel_org_id` from the database and require the caller to hold an org-specific grant that appears in the token's role claims (or, in dev-auth mode, in `x-idarms-authorized-org-ids`). A client-supplied `:assemblyId` is never trusted on its own.

- **Assembly Admin**: must hold `ASSEMBLY_ADMIN` in that assembly org. Ceiling is
  `FIELD_OPS_MANAGER`, `FINANCE_OFFICER`, `SECRETARY`, `CASHIER`, `FIELD_AGENT`,
  `ASSEMBLY_VIEWER`.
- **Concession Super Admin**: must hold a `CONCESSION_SUPER_ADMIN` grant in that
  assembly org (the external grant created during onboarding). Ceiling additionally
  includes `ASSEMBLY_ADMIN`.
- **Field Ops Manager and all other roles**: rejected with `403 role_forbidden` on
  these staff endpoints. Agent lifecycle management remains a separate Zones &
  Agents flow.

`PATCH /staff/:userId` and deactivate/reactivate/resend first verify the target's
**full current role set** with `canManageUserWithRoles()`, then apply the new role or
state. This blocks targets above the caller's ceiling. Deactivation also blocks
self-suspension and removal of the last active `ASSEMBLY_ADMIN`.

Deactivation runs the ZITADEL sequence:

1. `POST /v2/users/{userId}/deactivate`
2. `POST /v2/sessions/search` for the user
3. `DELETE /v2/sessions/{sessionId}` for every remaining session

ZITADEL v4.16.0 already invalidates sessions as part of deactivation, so the explicit
delete step normally finds zero remaining sessions; the post-deactivation search is
still performed and verified empty. The last observed session activity is persisted
as `staff_members.last_login_at` before revocation.

### Invite body

```json
{
  "name": "Ama Mensah",
  "email": "ama.mensah@example.gov.gh",
  "phone": "+233201234567",
  "role": "FIELD_AGENT"
}
```

The endpoint returns the ZITADEL user ID and one of `INVITED`, `ALREADY_EXISTS`, or
`EXISTING_USER_GRANTED`. It writes a `staff_members` row (for `invitedBy`/phone),
an audit record, and, when a Super Admin acts on an assembly with an active Assembly
Admin, a `staff_notifications` row.

### Bulk import

`POST /staff/bulk-import/validate` accepts:

- JSON `{ "rows": [...] }`, a bare JSON array, or `{ "csv": "..." }`
- raw `text/csv` / `text/plain` body

Rows use `name`, `email`, `phone`, `role`, and optional `assemblyCode` / `orgId`
(`assembly_code` / `org_id` also accepted). Validation writes only the persisted batch
record; it never invites. Statuses are:

`Valid`, `Warning`, `Duplicate`, `Invalid role`,
`Invalid — assembly mismatch`, `Error`.

`POST /staff/bulk-import/commit` re-validates against current ZITADEL users and the
caller's current role ceiling, then processes each row. Outcomes are:

`Invited`, `Already exists`, `Failed – retry available`, `Needs review`.

The batch and per-row results are stored in `staff_import_batches` and retrievable via
`GET /staff/bulk-import/:batchId`. Re-committing is safe: successfully invited rows are
seen as existing users and are not invited twice. The batch writes one summary audit
plus one audit per successfully invited user, and one notification when a Super Admin
commits.

## Audit queries (local)

The audit UI is backed by:

- `GET /v1/assemblies/:assemblyId/audit` — paginated, assembly-scoped audit history.
- `GET /v1/assemblies/:assemblyId/audit/actors` — distinct actors for the current
  date/action filters, with resolved names, roles, and counts.
- `GET /v1/concession/audit` — the caller's own actions across assemblies where a live
  `CONCESSION_SUPER_ADMIN` grant is found by the same Access Directory query. It also
  returns per-assembly counts/last activity and concession summary cards. It never
  returns a merged audit feed for every assembly.

Query parameters: `page`, `pageSize` (max 100), `from`, `to`, `action`, `actionPrefix`
(or a trailing `*` on `action`), `actorId`, and (concession view only) `assemblyId`.

Assembly endpoints reuse `resolveStaffAccess()`; the concession endpoint requires the
Super Admin role/capability and scopes the SQL query to the live accessible assembly
IDs. Audit rows are filtered by structured `actorId`, `action`, `occurredAt`,
`assemblyId`, and `outcome` columns. Human-readable sentences come from the shared
`formatAuditDescription()` in `packages/contracts/src/audit.ts`; filtering never parses
those sentences. Older onboarding rows are backfilled with `metadata.actorRole` by
migration `20261023120000_audit_activity_ledger`, which also adds actor/action indexes.

`POST /v1/preview/audit` records the one-time `preview.entered` audit row when a Super
Admin or Platform Admin enters the static preview experience. It validates the generic
persona and writes only an audit row; it does not create a user, grant, org, or token.
The preview screens themselves are frontend-only and make no backend reads.

## Consumed events

[]

## Published events

["fee_fixing.published.v1"]

## Local development

```bash
Copy-Item .env.example .env
pnpm prisma:generate
pnpm prisma:deploy
pnpm dev
```

Health: `/health/live`, `/health/ready`, `/metrics`, `/docs`.

To exercise the real portal screens (`/assembly/:assemblyId/staff-access` and
`/concession/access-directory`) against this service, validate ZITADEL tokens instead of
using dev headers:

```bash
AUTH_MODE=zitadel
ZITADEL_ISSUER=http://localhost:8080
ZITADEL_AUDIENCE=<idarms-portal client id>
ZITADEL_JWKS_URI=http://localhost:8080/oauth/v2/keys
```

The caller's home organisation comes only from the
`urn:zitadel:iam:user:resourceowner:id` claim (the portal requests the
`urn:zitadel:iam:user:resourceowner` scope). A token without it is refused with
401 `home_org_missing`; it is never inferred from role grants. Super Admins are
concession-scoped: their home org is the CONCESSION-scoped org (ADR-0002, ADR-0003).

## Organisations and the org registry

iDARMS runs one concession with several assemblies, and has two organisational scopes
(ADR-0003 decision 7):

| ZITADEL organisation | `zitadel_org_contexts` row | Holds |
|---|---|---|
| ZITADEL default org | none, never registered | Identity infrastructure: project, apps, machine users |
| Dedicated concession org | `CONCESSION`, our concession id, `assembly_id` null | Concession-wide users (Concession Super Admin) |
| One org per assembly | `ASSEMBLY`, same concession id, its assembly id | That assembly's staff |

`GET /v1/org-context/:orgId` answers from this table only. An unregistered or inactive
org has no tenant. The database allows one `CONCESSION` row per concession and keeps
scope and `assembly_id` consistent.

Assembly orgs are registered by onboarding. The concession org is registered with an
operator command, a dry run unless `--apply` is given:

```bash
pnpm --filter @idarms/concessions-management-service org:register-concession \
  --org-id <concession org id> --concession-id <concession uuid> --actor <your name> \
  [--domain <primary domain>] --apply
# production also needs --confirm-production
```

It refuses ZITADEL's infrastructure org (`ZITADEL_PROJECT_OWNER_ORG_ID`, or
`--infrastructure-org-id`), an org already registered as an assembly, a second concession
org, and any concession other than the one the registry already uses. Each write is
audited (`org_registry.concession_org_registered`). Locally, `pnpm zitadel:bootstrap`
creates the "iDARMS Concession" org and runs this command with `--sole-concession`.
Local UI fixtures: `concession-admin` / `Password1!` and
`ama-active-admin@idarms.local` / `Password1!` (active AMA Assembly Admin).
