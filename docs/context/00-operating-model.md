# Operating model: the definitive picture

Owner-confirmed on 2 Nov 2026 (ADR-0001, amended). **If any other file, the Framework PDF, the golden-template guide or CROIP's code disagrees with this page, this page wins.** Anything ambiguous goes to `docs/OPEN_QUESTIONS.md`, never a guess.

## The model in one paragraph

Identity is centralised; operations are distributed. **CROIP** is the single source of truth for ratepayers, properties and concessionaires, and it oversees how concessionaires operate. **iDARMS** (a concessionaire) registers ratepayers and properties *through* CROIP, receives a synced copy of those in its territory, generates bills, collects payments, runs its own field operations, and reports transactions to CROIP for oversight. This is a hybrid, not the original fully federated model.

## 1. Who owns what

| Area | CROIP | iDARMS (concessionaire) |
|---|---|---|
| Ratepayer identity | **Owns.** National database of all ratepayers. | Registers via CROIP API. Holds a **read-only synced copy** of ratepayers in its territory only. |
| Property identity | **Owns.** National database of all properties. | Same as ratepayers. |
| Concessionaires and concessions | **Owns.** Onboarding, MMDA assignment, contract dates, API credentials, permissions. | Receives credentials and its assigned territory. Never edits them. |
| Bills and assessments | Does **not** generate. Receives for assurance. | **Owns.** Generates for properties in its territory. |
| Payments and receipts | Does **not** collect. Receives reports. | **Owns.** Collects through its channels. |
| Oversight | **Owns.** Reconciliation against independent evidence, fraud detection, audit trail, case management, national reporting. | Reports transactions. Never writes oversight outcomes. |
| Local people and operations | Not involved. | **Owns.** Field agents, supervisors, local staff, devices, POS, customer service. |

## 2. Onboarding is split in two levels

1. **At CROIP (central):** the concession, its concession admin, its assigned MMDAs, its API credential and permissions.
2. **At iDARMS (local):** everyone below that. **Field agents, supervisors and all local staff are onboarded in iDARMS, never in CROIP.** iDARMS decides roles and permissions for its own staff in its own ZITADEL.

Consequence: when iDARMS calls CROIP it authenticates as **the concessionaire (a machine credential)**, not as a field agent. Each CROIP request that needs attribution carries a **stable opaque staff reference** issued by iDARMS (for properties this is `staffRef`). CROIP does not know the person. iDARMS must keep an audit trail that maps that reference to the real staff member and the device.

## 3. Concession, concessionaire and assemblies (settled 2 Nov 2026)

- A **concession** is CROIP's record of a collection contract. It has **one or more assemblies (MMDAs)**, contract dates and one API credential.
- The **concessionaire** is the entity that manages, and represents, the concession. iDARMS is the concessionaire's system.
- Onboarding a concession in CROIP **requires a concession admin** (a named person for that concession). CROIP's code at `9be15da` only takes contact name, phone and email on `POST /v1/concessions` and does not create a separate admin account, so what "concession admin" means technically is open (O25).

Rules that follow:

- Every replica row, query, registration and later bill is scoped by **concession and assembly**. Never assume a single assembly.
- The assigned assemblies can **grow, shrink or expire** (contract end dates). Treat them as data, not configuration.
- A property outside the concession's current assemblies must be rejected locally before calling CROIP, and CROIP is expected to reject it too.
- A ratepayer may relate to more than one concession (O2). Do not key a ratepayer to a single concession in the replica.
- Never write "concessions" to mean assemblies. Say "assemblies" or "MMDAs".

## 4. Flows

```
REGISTER   iDARMS staff/agent -> iDARMS API -> CROIP API (concessionaire credential, idempotency key)
           CROIP commits, assigns the ID, emits an event
DOWNSTREAM CROIP -> iDARMS: boundary, assignments, ratepayer and property copy (transport undecided, O17)
           iDARMS writes the replica only from this channel
BILLING    iDARMS generates bills and collects payments -> reports to CROIP    [DEFERRED]
OVERSIGHT  CROIP reconciles, detects fraud, audits                             [CROIP side; we only report]
```

## 5. Glossary (use these words exactly)

| Term | Meaning |
|---|---|
| Concessionaire | The entity that manages and represents a concession. iDARMS is its system. |
| Concession | CROIP's record of a collection contract: one or more assemblies, contract dates, one API credential, a concession admin. |
| Assembly / MMDA | A District/Municipal/Metropolitan Assembly. The territorial unit that bounds what a concessionaire may register and bill. |
| Replica | iDARMS's read-only copy of CROIP ratepayers and properties in its territory. |
| Concessionaire credential | OAuth client credentials issued by CROIP. Machine identity, five permissions only. |
| Local staff / agent | People onboarded in iDARMS. Invisible to CROIP except as an opaque reference. |
| Oversight | CROIP's reconciliation, fraud, audit and case management over concessionaire activity. |

## 6. What this page does not settle

Downstream transport (O17), how the territory is learned (O18), walk-in password (O19), unscoped CROIP lists (O20), credential expiry (O21), `staffRef` validation (O22), concession-versus-assembly cardinality (O22), and the open items O24 (CROIP personnel register) and O25 (what a concession admin is).
