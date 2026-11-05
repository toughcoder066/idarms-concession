# How iDARMS sign-in, organisations and roles work (plain English)

This is the readable version. The formal decisions are in `docs/decisions/` (mainly ADR-0003 and ADR-0004). If this page and an ADR disagree, the ADR wins.

Last updated 5 Nov 2026.

---

## 1. The big picture in five sentences

1. **CROIP** is the national system. It owns the official list of ratepayers, properties, concessions and assemblies. iDARMS never invents those.
2. **iDARMS** is the system of one concessionaire (us). Our concession covers several assemblies (for example Accra Metropolitan and Ledzokuku).
3. **ZITADEL** is the login system iDARMS uses for its own staff. It answers "who is this person and what are they allowed to do?"
4. Our staff (concession admins, assembly admins, field agents, cashiers) exist **only in iDARMS's ZITADEL**. CROIP never sees them, only an anonymous staff reference.
5. When iDARMS talks to CROIP, it logs in as a machine (a "concessionaire credential"), not as a person.

---

## 2. How ZITADEL is laid out, and why

ZITADEL groups everything into **organisations** ("orgs"). We use three kinds.

| Org | What it is for | What lives there |
|---|---|---|
| **ZITADEL's default org** (named "ZITADEL") | ZITADEL's own housekeeping. Created automatically when ZITADEL was installed. | ZITADEL's console and internal apps, the installation admin key, ZITADEL's own login client, and `croip-m2m` (a fake CROIP credential for local testing only). **No iDARMS staff, no iDARMS project.** |
| **iDARMS Concession** | iDARMS itself, the platform. There is only ever one. | The **iDARMS project** (its 9 roles and its two apps, `idarms-portal` and `idarms-api`), iDARMS's own robot accounts (`idarms-login-client`, `idarms-provisioner`) and concession-wide people like the Concession Admin. |
| **One org per assembly** (e.g. "Accra Metropolitan Assembly") | That assembly's staff. | Assembly admins, field agents, cashiers and so on for that assembly only. |

### Why we moved things (the 4 Nov 2026 change)

Before 4 Nov, the iDARMS project sat in ZITADEL's default org, next to ZITADEL's own internal project. That mixed two different jobs in one place: "running ZITADEL" and "running iDARMS".

The rule now is simple: **ZITADEL runs ZITADEL; the iDARMS Concession org runs iDARMS.**

Why this is better:
- **Clear ownership.** Everything about iDARMS (roles, apps, robot accounts, admins) is in one org that belongs to iDARMS.
- **Smaller blast radius.** People and robots that manage iDARMS don't need to touch the org that runs ZITADEL itself.
- **Matches the real world.** The concession is the platform; assemblies sit under it.

### "Owning" a project versus "using" it

- The **iDARMS Concession org owns** the iDARMS project. Only it defines the roles and apps.
- Each **assembly org uses** the project through a **project grant**. A grant is ZITADEL's way of saying "this other org may hand out these roles to its own people". An assembly cannot change the project and gets no power over any other assembly.

### What happened to the old project

ZITADEL cannot move a project from one org to another, so the move was really "build a new one, copy, then delete the old one":
1. **4 Nov:** the bootstrap script created a fresh iDARMS project in the iDARMS Concession org, with new apps and the same 9 roles. It copied every assembly's grant and every person's roles across. The old project was only read, never changed.
2. Everything was pointed at the new project (the `.env` files: project id, client id, audience). Old sessions ended, so everyone signed in again.
3. We tested sign-in: an assembly admin, then the concession admin (done by the owner in the browser).
4. **5 Nov:** with the owner's explicit approval, the old project (created 20 Oct) was deleted. ZITADEL removed its two old apps, its project grants (the October grants you could see on each assembly org) and the role assignments on it at the same time. Only the 4 Nov grants remain. The same day, the old login robot `idarms-portal-login` (in ZITADEL's default org) was deleted too, because `idarms-login-client` in the iDARMS Concession org does the same job.

Side effect worth knowing: `croip-m2m` had a role on the old project, and that role is now gone. `croip-m2m` is only a local fake of CROIP's credential, so this matters only if you test the portal's "call CROIP" path locally (see section 8).

---

## 3. Who is who: three levels of admin

These are **business** roles. They are not ZITADEL's own admin roles.

| Level | Who | Where they work |
|---|---|---|
| **Platform Super Admin** | The operator who runs the servers and ZITADEL itself. | ZITADEL console, setup scripts and operator commands. **Has no iDARMS role** and cannot look into concession or assembly data. Keeping the infrastructure person out of the business data is deliberate. |
| **Concession Admin** | The iDARMS role `CONCESSION_SUPER_ADMIN`. Their home org is the iDARMS Concession org. | The iDARMS portal only. Manages concession staff, onboards assemblies, and can **read** across all our assemblies (ADR-0002). Cannot do an assembly's day-to-day operations for it. |
| **Assembly Admin** | The iDARMS role `ASSEMBLY_ADMIN`. Their home org is one assembly org. | The iDARMS portal only. Manages that assembly's staff and nothing else. |

**Nobody gets ZITADEL's "owner" roles** (`ORG_OWNER`, `PROJECT_OWNER`) on the iDARMS Concession org. Those roles would let a person rebuild roles, apps or other admins directly in ZITADEL, around iDARMS's own rules and audit trail. All admin work is done in the iDARMS portal, and the backend makes the ZITADEL changes for them.

---

## 4. How iDARMS knows which assembly you belong to

When you sign in, ZITADEL tells iDARMS two things:
- **your home org** (which org your account lives in), and
- **your roles** on the iDARMS project.

iDARMS then looks up your home org in its own **org registry** (a table in the concessions-management database). Each registered org says:
- `CONCESSION` scope: "this is the iDARMS Concession org", with our concession id and no assembly, or
- `ASSEMBLY` scope: "this is assembly X of our concession".

That lookup is your **tenant**: which concession and which assembly you are in. Every screen and every database query filters by it.

Why it is done this way:
- The tenant comes from a **verified login**, never from something the browser sends (a form field or URL). So you cannot claim to be in another assembly by editing a request.
- If the lookup fails, iDARMS **refuses**. It never guesses and never shows everything.
- ZITADEL's default org is **never registered**, so even if someone were created there by mistake, they would have no tenant and could not see anything.

### How the services ask the registry (since 5 Nov 2026)

The registry lives in concessions-management, so every other service has to ask it "which tenant is this person in?". Until 5 Nov anyone on the network could ask that question about any org, with no login at all (audit finding T5).

Now:
- **The service sends the person's own login token with the question**, and concessions-management checks that token again: that ZITADEL really signed it, that it was issued for iDARMS, and that it has not expired.
- **It only ever answers about the person's own org**, the one written into their token by ZITADEL. There is no way to ask about someone else's org; the old "ask about any org by id" address no longer exists.
- **Knowing your tenant opens nothing by itself.** Every service still checks your roles and filters every query by your assembly. The answer only tells it *which* assembly to filter by.
- **Answers are remembered for at most a minute** (15 seconds for "this org isn't registered"), per org, never per person. So if an assembly is removed from the registry, the services stop using it within a minute. Login tokens themselves are never stored, logged or shown in error messages.
- **In production the question must travel over HTTPS.** A service set up with a plain `http://` address for the registry refuses to start.
- **Only people with an iDARMS role get an answer.** Someone who can sign in to ZITADEL but holds no iDARMS role in their own org is refused.
- **Only the right kind of token is accepted.** ZITADEL hands the portal two tokens at sign-in: an *access token* (a key for calling APIs) and an *ID token* (a note saying who signed in). They look alike, so until now a service would have taken either. Now every service accepts only the access token.

Two settings keep this honest:
- `ZITADEL_PROJECT_OWNER_ORG_ID` is the iDARMS Concession org. Onboarding stops (error `project_owner_mismatch`) if this doesn't match the org registered as `CONCESSION`.
- `ZITADEL_DEFAULT_ORG_ID` is ZITADEL's default org. It is used only to **refuse** ever registering that org. The registration command also asks ZITADEL which org really is the default and refuses if the setting is wrong.

---

## 5. Signing in to the portal

- The login page is iDARMS's own page (ADR-0004). Your browser talks only to the iDARMS portal. The portal talks to ZITADEL on the server side using the `idarms-login-client` robot.
- After sign-in, the session is kept **on the server**. Your browser holds only a session cookie, never the ZITADEL access or ID tokens. That way a malicious script in the page has no token to steal.
- If you sign in but have **no iDARMS role**, you are signed straight out again. A person with no role has no business in the portal.

**Developers** can skip the sign-in when trying a single service locally: "header identity" lets you pretend to be any role in any assembly, but only on your own machine (a service in that mode refuses to accept connections from other computers and refuses to run in production). How to do that, and how the automated tests stand in for ZITADEL, is in `docs/LOCAL_DEVELOPMENT.md`.

---

## 6. Onboarding a new assembly

This is a business action, done by the Concession Admin in the portal:

1. The Concession Admin picks an assembly.
2. iDARMS checks that the assembly is on our **active assigned-assembly list**, meaning CROIP has assigned it to our concession and the contract dates cover today. That list comes from the croip-integration service (`GET /v1/assigned-assemblies`).
3. If it is not on the list, onboarding is refused (`assembly_not_assigned`). If the list cannot be read, it is also refused (`assignment_check_unavailable`). **iDARMS never creates assemblies**, because CROIP owns them.
4. If all is well, the backend (using the `idarms-provisioner` robot):
   - creates the assembly's org in ZITADEL,
   - grants it the iDARMS project,
   - sets up its first admin, and
   - registers it in the org registry as `ASSEMBLY`.

Nobody needs to open the ZITADEL console for this.

**Current local-data snag:** Accra's CROIP id in our data (`croip_asm_998234`) is not on the dev assigned list, and Ledzokuku has no CROIP id. Both are already onboarded, so they keep working, but onboarding anything new will be refused until the assigned-assembly import and the assemblies' CROIP ids are lined up.

---

## 7. The robot (machine) accounts

| Robot | Lives in | ZITADEL role | Used for |
|---|---|---|---|
| `idarms-login-client` | iDARMS Concession | `IAM_LOGIN_CLIENT` | The portal's own login page. This is the narrowest role that can do logins. |
| `idarms-provisioner` | iDARMS Concession | `IAM_ORG_MANAGER` | Onboarding assemblies and managing staff accounts. |
| installation admin key | ZITADEL default org | full admin | Only the setup scripts and one-off operator jobs. **Never used by a running service.** |
| `croip-m2m` | ZITADEL default org | none on iDARMS now | A local fake of the credential CROIP gives us. Not a real iDARMS identity. |

**An honest limit on `idarms-provisioner`:** ZITADEL has no role that can *only* create orgs. The smallest role that can do it, `IAM_ORG_MANAGER`, can also manage any org's members, settings, projects, apps and users' passwords, across the whole ZITADEL. It cannot change ZITADEL's instance-wide settings, so it is still narrower than the full admin. But a leaked provisioner key would be very serious. That is why:
- the key stays on the backend, in a gitignored `.secrets/` folder locally and a secrets manager elsewhere;
- the provisioning code refuses to talk to any ZITADEL other than the expected one.

Planned improvement: split staff management into a second robot with the smaller `IAM_USER_MANAGER` role, so the powerful one is used only for onboarding.

---

## 8. Things still open or to do

- `croip-m2m` lost its role when the old project was deleted. This changes nothing today: the portal's local "call CROIP" path already stops with a configuration error, because neither `CROIP_ZITADEL_PROJECT_ID` nor `CROIP_OAUTH_SCOPE` is set in `apps/idarms-portal/.env.local`. Against real CROIP, CROIP gives us its own project id. These calls are being rebuilt behind the CROIP adapter anyway.
- Line up the assigned-assembly list with the assemblies' CROIP ids (section 6).
- Remove the old "platform admin onboards" path, which the assignment check now blocks anyway.
- Split the provisioner robot (section 7).
- ~~The org-registry lookup between services is unauthenticated.~~ Fixed 5 Nov 2026 (section 4).

---

## 9. Where to look for the details

| Topic | File |
|---|---|
| Who owns what between CROIP and iDARMS | `docs/context/00-operating-model.md`, ADR-0001 |
| Concession Admin can read across assemblies | ADR-0002 |
| Orgs, tenant lookup, admin levels, robots, the migration | ADR-0003 (decisions 7 to 9) |
| The portal's own login page | ADR-0004 |
| Setting it all up locally | `README.md` (`pnpm zitadel:bootstrap`) |
| What is built and what isn't | `docs/STATUS.md` |
