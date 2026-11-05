# ADR-0004: The portal hosts its own login; ZITADEL authenticates behind it

Status: **Accepted by the owner, 3 Nov 2026.** Builds on ADR-0003 (tenant context from ZITADEL's organisation claims).

## Context

The portal's `/login` redirected the browser to ZITADEL's authorize endpoint and on to ZITADEL's hosted login app (`/ui/v2/login`). The owner wants a regular login screen in the portal, with no intermediate screen and no browser redirect to ZITADEL, while ZITADEL stays the identity provider.

ZITADEL has no password grant (OAuth 2.1 removes it). Its supported route for a custom login is the Session API v2 together with OIDC auth requests. A spike against the local ZITADEL v4.16 instance confirmed every call this needs (19 of 22 checks; the three misses are explained below).

## Decision

1. **The portal renders every login screen.** These are `/login`, `/password/forgot`, `/password/reset`, `/password/change` (a change ZITADEL requires) and `/invite/accept` (a first password from an invitation). The browser never visits ZITADEL. MFA is out of scope for now.
2. **Sign-in runs on the portal server:**
   - Auth.js builds the authorization URL and sets its state and PKCE cookies.
   - The server calls ZITADEL's authorize endpoint itself and reads the auth request id.
   - It checks the password by creating a ZITADEL session (`POST /v2/sessions`).
   - It completes the auth request with that session (`POST /v2/oidc/auth_requests/{id}`).
   - It sends the browser to the returned URL, which is the portal's own Auth.js callback carrying the code.

   Auth.js then checks state and PKCE and exchanges the code as before, so access, ID and refresh tokens and everything in ADR-0003 are unchanged.
3. **The portal authenticates to ZITADEL as a dedicated machine user** `idarms-login-client` in the iDARMS Concession org (originally `idarms-portal-login` in ZITADEL's default org; replaced and deleted under ADR-0003 decision 9) with the instance role `IAM_LOGIN_CLIENT`, using a JSON key in `.secrets/` (gitignored). `pnpm zitadel:login-client` sets this up, and so does the bootstrap. The key is server-only: never in the browser, never logged.
4. **Codes before passwords.** The login client can set any user's password, so the portal sets a password only in these cases:
   - **Reset:** after ZITADEL accepts a reset code.
   - **Invitation:** after ZITADEL verifies the invite code, and only then the first password.
   - **Forced change:** for a user whose password ZITADEL has just checked. The pending sign-in is held in a sealed cookie for 10 minutes, and a server-issued reset code is used immediately.

   Password rules are checked before an invite code is spent.
5. **No account enumeration.** A wrong password, an unknown user and a locked account give the same message. "Forgot password" always answers that a link was sent if the account exists.
6. **Links come from configuration.** Reset links use `AUTH_URL`. Invitation links use concessions-management's `PORTAL_URL`. Neither is ever taken from a request header, and both must be `https` in production. Invitations use ZITADEL's v2 invite code with the portal's `/invite/accept` URL. The user is created with `returnCode`, so ZITADEL sends no email of its own.
7. **Sign-out is server-side.** The portal ends the ZITADEL session (its handle is kept in a sealed cookie), revokes the refresh token, clears the portal cookies and shows `/signed-out`. ZITADEL's logout page is not used.
8. **Abuse controls:**
   - **Rate limits** per IP and per username on login, forgot password and code pages. They are held in memory, per portal instance.
   - **CSRF:** the Origin check that Next.js server actions already do.
   - **Lockout:** ZITADEL's lockout policy still applies.

## Consequences

- The portal now receives passwords. It must be served over HTTPS outside local development, and passwords and codes are never logged (covered by tests).
- `IAM_LOGIN_CLIENT` is a powerful credential. Treat its key like the database password: rotate it by issuing a new key and deleting the old one.
- ZITADEL's admin console (`localhost:8080`) still uses ZITADEL's own login. It is for platform administrators, not iDARMS staff.

## Not settled here

- **ZITADEL still points a stray authorize request at its own screen.** The setup script sets the `idarms-portal` app's login page to the portal, but in the spike ZITADEL still redirected to `/ui/v2/login`. The portal never sends a browser there, so only someone opening the authorize URL directly would see ZITADEL's screen. Follow-up: set the app's login version in the ZITADEL console or through the v2 app API.
- **No local email.** The local stack has no SMTP, so reset and invitation emails are not delivered locally until ZITADEL is given an SMTP server (for example a Mailpit container).
- **Rate limits are per instance.** They need a shared store once there is more than one portal instance.
- **MFA** is not offered yet.
