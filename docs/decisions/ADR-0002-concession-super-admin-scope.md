# ADR-0002: The concession super admin sees every assembly but does not operate in any

Status: **Accepted by the owner, 2 Nov 2026.** Answers OPEN_QUESTIONS O29.

## Context

Slice 1a made every service refuse a request unless both a concession and an assembly are resolved. The concession super admin belongs to the concession-level org and has no assembly, so they lost all lists in the nine template services. The code also gave the super admin operational write powers (rate drafts, agent assignment) that the owner does not intend.

## Decision

1. **One application, scoped by tenancy.** Every assembly of every concession runs on the same iDARMS deployment. What a user sees is decided only by the tenant context from their verified token.
2. **The concession super admin is the central viewer below CROIP.** They see every record of every assembly in **their own concession** (ratepayers, properties, bills, payments, valuations, reconciliation, documents, reports), whether the concession has 1 or 10 assemblies. Every record shown carries the assembly it belongs to. They never see another concession.
   - Each iDARMS installation serves one concession, so at this level other concessions do not exist; only CROIP knows them.
   - Queries still always filter by `concessionId`. **This is a safety net, not a business rule** (owner decision, 2 Nov 2026).
   - It guarantees no query runs unfiltered (for the super admin it is the only filter).
   - It hides any foreign record that slips in from CROIP (G5, T4).
   - It keeps the code safe if the system is ever hosted for more than one concessionaire, or an assembly moves between concessions.
   - Do not remove it, and do not read it as a cross-concession feature.
3. **The super admin does not take part in assembly operations.** They do not register, verify, value, bill, collect, reconcile, draft rates or assign field agents in any assembly. Those stay with each assembly's own staff.
4. **The super admin keeps administration and support powers only:**
   - onboarding new assemblies (workspace setup, inviting the first Assembly Admin);
   - managing assembly staff (invite, disable, re-enable; troubleshooting access);
   - editing assembly settings (branding, logo, bill notice, profile, revenue targets).
   Fee-fixing drafts and agent assignment become **view-only** for the super admin.
5. **Every other role is assembly-specific.** It sees and acts only in its own assembly.

## Consequences for iDARMS

- Read routes accept a concession-only context **only** for the `CONCESSION_SUPER_ADMIN` role at portfolio scope, and then filter by concession. All other callers still need both concession and assembly.
- Write routes always need a specific assembly. The super admin holds no operational write capability.
- Once the assigned-assembly cache exists (`BoundaryProvider`, STATUS slice 4), the super admin view narrows to the concession's **currently assigned** assemblies, so an assembly whose contract has ended drops out.
- `concessions-management-service` removes `fee_fixing:manage` and `agent:manage` from the super admin, and stops treating the scope level alone as permission to see all assemblies.
- CROIP still owns concessions and assembly assignments (ADR-0001). "Onboarding an assembly" here means setting up iDARMS's local workspace for an assembly CROIP has assigned. Reconciling this with the local assembly records is O27.
