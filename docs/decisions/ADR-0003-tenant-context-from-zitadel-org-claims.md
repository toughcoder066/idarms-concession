# ADR-0003: Tenant context comes from ZITADEL's organisation-bound claims

Status: **Accepted by the owner, 3 Nov 2026.** Replaces the golden template guide's `urn:idarms:context` claim ("Expected context claim", `docs/source/idarms-golden-template-guide-v1.0.md`). Implemented in commit `17a11df`.

## Context

The docs described two designs for how an iDARMS service learns who a caller is and which concession and assembly they work in:

- `CLAUDE.md` §5 and `docs/context/03-golden-template-rules.md` followed the guide: a signed `urn:idarms:context` claim `{concessionId, assemblyId}` added to the token by a ZITADEL action.
- `README.md` and `docs/golden_template.md` recorded that the `idarmsContext` action was removed and tenant context is resolved from ZITADEL organisation claims through the iDARMS org registry.

The code followed the second design, but guessed an Assembly Admin's home organisation from their role grants when the resource-owner claim was missing, and merged roles from every organisation into one permission set.

## Decision

1. **The iDARMS access token carries three things, and iDARMS uses only these:**
   - **Identity:** `sub`, the user who signed in.
   - **Home organisation:** `urn:zitadel:iam:user:resourceowner:id`, the ZITADEL organisation the user belongs to. The portal requests it with the `urn:zitadel:iam:user:resourceowner` scope.
   - **Role grants per organisation:** `urn:zitadel:iam:org:project:roles`, or `urn:zitadel:iam:org:project:{ZITADEL_PROJECT_ID}:roles` for the iDARMS project only.
2. **Permissions come only from roles granted in the home organisation.** A role granted in another organisation never applies to the request (`rolesInOrg`). The concession super admin's grant must be on their home (portfolio) organisation (ADR-0002).
3. **Concession and assembly come from the org registry.** concessions-management maps the home organisation to `{concessionId, assemblyId, scope}`. The token carries no concession or assembly IDs: there is no `urn:idarms:context` claim, no ZITADEL token action and no user metadata for tenancy. This mapping is iDARMS data and changes when assemblies are onboarded or reassigned.
4. **Never guess.** A token without the home-organisation claim is refused (401 `home_org_missing`) and logged with the claim names present. The home organisation is never inferred from role grants.
5. **Only role claims count.** The `urn:idarms:permissions` claim is not read. Role claims from any other ZITADEL project are ignored. Every service requires a numeric `ZITADEL_PROJECT_ID` when `AUTH_MODE=zitadel`.
6. **Unchanged:** tenant context never comes from a request body, query string or event payload, and every query still filters by concession (and assembly, except the super admin's read view under ADR-0002).

## Consequences

- `CLAUDE.md` §4 and §5, `docs/context/03-golden-template-rules.md`, `docs/context/04-phase1-connect-register-receive.md` §2.2, `README.md` and `services/concessions-management-service/README.md` now describe this model.
- The CROIP rule is unaffected: CROIP tokens carry no concession claim, and iDARMS never reads tenancy from a CROIP token.
- A tenancy change (an assembly onboarded or reassigned) takes effect on the next registry lookup, not on the next token refresh.

## Not settled here

- **The registry lookup is unauthenticated.** Services call `GET /v1/org-context/:orgId` on concessions-management with no token, over plain HTTP locally, and cache answers for 5 minutes (including "not found"). This ADR does not change that; hardening it is a separate decision.
- **The resolver picks `assembly.concessions[0]`,** not necessarily the active concession assignment. To be fixed in its own step.
- **The local ZITADEL v4.16.0 instance was recorded as omitting the resource-owner claim** when the scope was not requested. The owner will confirm with a browser login that the scope makes it appear in the access token.
