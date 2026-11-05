# ADR-0003: Tenant context comes from ZITADEL's organisation-bound claims

Status: **Accepted by the owner, 3 Nov 2026. Amended 3 Nov 2026** (organisational structure, decision 7) **and 4 Nov 2026** (the iDARMS Concession org owns the iDARMS project; administration and provisioning; decisions 7 to 9). Replaces the golden template guide's `urn:idarms:context` claim ("Expected context claim", `docs/source/idarms-golden-template-guide-v1.0.md`). Implemented in commit `17a11df`.

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
2. **Permissions come only from roles granted in the home organisation.** A role granted in another organisation never applies to the request (`rolesInOrg`). The concession super admin's grant must be on their home organisation, the CONCESSION-scoped org (ADR-0002).
3. **Concession and assembly come from the org registry, and only from it.** concessions-management maps the home organisation to `{concessionId, assemblyId, scope}`. An org that is not registered, not `ACTIVE`, or whose row is inconsistent resolves to no tenant; the resolver never falls back to the assembly or contract tables. The token carries no concession or assembly IDs: there is no `urn:idarms:context` claim, no ZITADEL token action and no user metadata for tenancy. This mapping is iDARMS data and changes when assemblies are onboarded or reassigned.
4. **Never guess.** A token without the home-organisation claim is refused (401 `home_org_missing`) and logged with the claim names present. The home organisation is never inferred from role grants.
5. **Only role claims count.** The `urn:idarms:permissions` claim is not read. Role claims from any other ZITADEL project are ignored. Every service requires a numeric `ZITADEL_PROJECT_ID` when `AUTH_MODE=zitadel`.
6. **Unchanged:** tenant context never comes from a request body, query string or event payload, and every query still filters by concession (and assembly, except the super admin's read view under ADR-0002).

7. **Organisational structure: ZITADEL runs ZITADEL, the iDARMS Concession org runs iDARMS.** iDARMS runs one concession with several assemblies, in one ZITADEL instance.

   | ZITADEL organisation | Registry row | What it holds |
   |---|---|---|
   | ZITADEL's default org (created with the instance) | **none, never registered** | ZITADEL itself: its internal project, console and internal clients, instance administration, the first-instance admin key, and `croip-m2m`. `croip-m2m` stands in, in development, for the credential CROIP issues from **its own** ZITADEL; it is not an iDARMS identity. No iDARMS staff. |
   | The iDARMS Concession org (local: "iDARMS Concession") | scope `CONCESSION`, our concession id, `assemblyId` null | The **iDARMS project** (the 9 roles, the `idarms-portal` and `idarms-api` apps), iDARMS's machine identities (`idarms-login-client`, `idarms-provisioner`) and concession-wide users such as the Concession Super Admin. |
   | One org per assembly | scope `ASSEMBLY`, the same concession id, that assembly's id | That assembly's staff. It uses the project through a **project grant** from the concession org and never owns it. |

   - `CONCESSION` and `ASSEMBLY` are the only scopes. `PORTFOLIO` meant the same as `CONCESSION` and is gone, including the `portfolio:*` capability names (now `concession:*`).
   - The database enforces that a `CONCESSION` row has no assembly, that an `ASSEMBLY` row has one, and that a concession has at most one `CONCESSION` org (migration `20261103120000_org_registry_concession_scope`).
   - **Project ownership and project access are separate.** The concession org owns the project; assembly orgs only receive grants. No assembly gets privileges over another assembly.
   - **Two settings, two jobs.** `ZITADEL_PROJECT_OWNER_ORG_ID` is the org that owns the project: the concession org. Onboarding refuses (503 `project_owner_mismatch`) if it differs from the registered `CONCESSION` org. `ZITADEL_DEFAULT_ORG_ID` is ZITADEL's default org and is only ever used to refuse registering it.
   - The concession org is registered with the operator command `org:register-concession` in concessions-management (dry run unless `--apply`; `--confirm-production` in production). It refuses ZITADEL's default org, a second concession org, another concession, or an org already registered as an assembly. It checks `ZITADEL_DEFAULT_ORG_ID` against ZITADEL's actual default org with the provisioning key, refuses a mismatch (`default_org_mismatch`), and in production refuses when the check cannot run (`default_org_unverified`). The local bootstrap creates the org and runs the same command.
   - Code that needs the concession org (super admin look-ups in onboarding and audit) reads it from the registry.

8. **Administration: business roles in iDARMS, infrastructure roles in ZITADEL, never mixed.** Ordinary business administrators never need the ZITADEL console.

   | Level | What it is | Where it acts |
   |---|---|---|
   | **Platform Super Admin** | An operator role **outside iDARMS**: infrastructure, ZITADEL setup, bootstrap and operator commands, machine identities. It has **no iDARMS project role** and no administrative bypass into concession or assembly data (`CLAUDE.md` §4: no bypass without an approved oversight use case). | ZITADEL instance administration, bootstrap and operator commands. |
   | **Concession Admin** | The existing iDARMS role `CONCESSION_SUPER_ADMIN`, home org the concession org: concession staff, assembly onboarding, concession-wide business administration. Renaming the role is a separate change. | The iDARMS portal and API only. |
   | **Assembly Admin** | The iDARMS role `ASSEMBLY_ADMIN`, home org its assembly org: that assembly's staff and roles, nothing in other assemblies. | The iDARMS portal and API only. |

   - **No human receives ZITADEL's `ORG_OWNER` or `PROJECT_OWNER`** (or any other manager role) on the concession org as part of normal administration. iDARMS roles never imply ZITADEL manager roles. The bootstrap reports any manager membership it finds there.
   - ZITADEL instance administrators keep their instance-wide powers; where the project lives does not change that.
   - **Assembly onboarding is a business action executed by the backend.** The Concession Admin picks an assembly in the portal; concessions-management authenticates and authorises the caller, then the provisioning service creates the assembly's ZITADEL org, grants the project from the concession org, sets up its grants and registers it as `ASSEMBLY`. Machine credentials stay on the backend.
   - **iDARMS never creates or authors assemblies; CROIP owns and assigns them.** Onboarding provisions only an assembly whose CROIP id is on the concession's **active assigned-assembly list** today (croip-integration-service `GET /v1/assigned-assemblies`, read with the caller's own credentials, contract dates enforced). Anything else is refused with 409 `assembly_not_assigned`; an assembly with no CROIP id is refused the same way, and an unreadable list fails closed (503 `assignment_check_unavailable`). Any approval step for onboarding would be a separate business workflow.
   - **Machine identities.** iDARMS's own machine users live in the concession org, each with one instance role and a key kept in a secrets store (locally: gitignored `.secrets/`):
     - `idarms-login-client`: `IAM_LOGIN_CLIENT`, the portal-hosted login (ADR-0004). This is ZITADEL's narrowest role for it.
     - `idarms-provisioner`: `IAM_ORG_MANAGER`, used by concessions-management for onboarding and staff management. Before this decision, provisioning used the first-instance admin key (`IAM_OWNER`); it no longer does.
     - The first-instance admin key and `croip-m2m` stay in ZITADEL's default org.
   - **Unavoidable permission limitation** (checked against ZITADEL v4.16's own role-to-permission table, 4 Nov 2026). Only `IAM_OWNER` and `IAM_ORG_MANAGER` hold `org.create`, and no ZITADEL role grants org creation alone. So the provisioner holds `IAM_ORG_MANAGER`. It is narrower than `IAM_OWNER`: it has no `iam.*` permission, so it cannot change instance settings or instance members, and it cannot impersonate users. But it applies to **every org on the instance, ZITADEL's default org included**: it can manage org memberships (`org.member.write`), change org settings (`policy.*`, `org.idp.*`, `org.action.*`, `org.flow.*`), change or delete any project and app (`project.*`, `project.app.*`), and change any user's credentials (`user.write`, `user.credential.write`). A leaked provisioner key is therefore close to instance-admin power. Mitigations: the key never leaves the backend, the provisioning client refuses any non-local ZITADEL (scope lock), and the key file is readable by its owner only. Follow-ups, not decided here:
     - Split it into an `IAM_USER_MANAGER` identity for day-to-day staff management (no org creation, settings or apps) and keep `IAM_ORG_MANAGER` for onboarding only.
     - Adopt ZITADEL's fine-grained permissions if a later version offers org creation on its own.
     - Plan key rotation.

9. **Migration and decommissioning (development, 4 Nov 2026).** The bootstrap creates the new project, roles and apps in the concession org and copies the previous project's project grants and user grants to it. It **only reads** the previous project, which ZITADEL's default org owns. The previous project, its apps and the older `idarms-portal-login` machine user stay in place as a fallback. They are deleted only after the new setup is verified, and **only with separate, explicit owner approval**: approving the migration does not approve the deletion. `croip-m2m` keeps its grant on the previous project until then (it only stands in for CROIP's credential), so deleting the previous project also needs a decision about `croip-m2m`.

   **Done 5 Nov 2026, with owner approval.** After the owner signed in as the Concession Admin on the new project, the previous project `395947172589207555` (created 20 Oct 2026) was deleted. ZITADEL removed with it its two apps, its project grants to both assembly orgs and the concession org, and every user grant on it, including `croip-m2m`'s `CROIP_M2M`. Verified in ZITADEL's projections afterwards: only the new project `398149919480741892`, its two apps, its two project grants and its six user grants (all 4 Nov) remain, and an assembly admin still signs in. The same day, also with owner approval, the unused `idarms-portal-login` machine user (ZITADEL's default org, `IAM_LOGIN_CLIENT`, last used 4 Nov before the migration) was deleted with its local key file, since `idarms-login-client` does the same job from the concession org; sign-in was re-tested afterwards. ZITADEL's default org now holds only ZITADEL's own users, the first-instance admin key and `croip-m2m`. A plain-English account is in `docs/HOW_IT_WORKS.md`.

## Consequences

- `CLAUDE.md` §4 and §5, `docs/context/03-golden-template-rules.md`, `docs/context/04-phase1-connect-register-receive.md` §2.2, `README.md` and `services/concessions-management-service/README.md` now describe this model.
- The CROIP rule is unaffected: CROIP tokens carry no concession claim, and iDARMS never reads tenancy from a CROIP token.
- A tenancy change (an assembly onboarded or reassigned) takes effect on the next registry lookup, not on the next token refresh.
- Assembly onboarding refuses (409 `concession_org_unregistered`) until the concession org is registered, and refuses an assembly that is not assigned to the concession today.
- Users in ZITADEL's default org have no tenant and cannot hold roles on the iDARMS project, which is not granted to that org.
- Moving the project changed its id and its apps' client ids, so the role claim key, `ZITADEL_PROJECT_ID`, `ZITADEL_CLIENT_ID` and `ZITADEL_AUDIENCE` changed everywhere, and existing sessions ended.

## Not settled here

- **The registry lookup is unauthenticated.** Services call `GET /v1/org-context/:orgId` on concessions-management with no token, over plain HTTP locally, and cache answers for 5 minutes (including "not found"). This ADR does not change that; hardening it is a separate decision.
- **Settled by decision 7:** the resolver no longer reads `assembly.concessions[0]`; it uses the registry only.
- **Confirmed 3 Nov 2026:** with the `urn:zitadel:iam:user:resourceowner` scope, the local ZITADEL v4.16.0 instance puts the resource-owner claim in the access token (sign-ins as an assembly admin resolved their assembly from it).
