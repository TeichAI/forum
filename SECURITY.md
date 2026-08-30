# Security policy and risk decisions

Report vulnerabilities privately to the repository maintainers rather than opening a public issue. Do not include session tokens, cookies, credentials, personal data, or production exploit details in a report.

## Clerk JavaScript-readable session token

### Decision

- **Status:** conditionally accepted vendor risk
- **Severity:** Medium (requires script execution in the application origin)
- **Review trigger:** a Clerk authentication architecture or SDK change, a CSP regression, a new client-side token consumer or injection sink, or a confirmed XSS report

Clerk sets its short-lived session JWT in the application-domain `__session` cookie without `HttpOnly`. This is intentional: Clerk's browser SDK receives and refreshes the JWT and therefore must be able to access it from JavaScript. The installed `@clerk/nextjs` integration has no supported application option that can make this cookie `HttpOnly`. Treating the flag as a local cookie misconfiguration, rewriting Clerk cookies, or relying on an undocumented SDK override would break token refresh and is not an acceptable patch.

Clerk documents a 60-second session-token lifetime. The authenticated production audit on 2026-08-29 observed the expected JavaScript-readable `__session` cookies. Operators must verify that effective lifetime after Clerk configuration or SDK changes by decoding a newly issued token locally and comparing its numeric `exp` and `iat` claims. Never paste, transmit, commit, or log the raw token; close the inspection environment after recording only the lifetime and date. A result greater than 60 seconds is a release blocker pending a Clerk review.

### Root cause and impact

The root cause is Clerk's hybrid session architecture, not application code setting the cookie. If an attacker first achieves reflected, stored, or dependency-supplied XSS in this origin, their script can read and exfiltrate the current JWT. The stolen JWT can impersonate the victim until it expires, exposing all authenticated operations available to that victim, including private mail and account actions. Compromise of a moderator or administrator has correspondingly greater content-moderation and account impact.

The 60-second JWT expiry narrows the replay window but does not eliminate risk. Persistent script execution can repeatedly obtain refreshed tokens while the victim remains active. Moreover, an origin XSS can issue authenticated same-origin requests even when cookies are `HttpOnly`; changing this flag alone would not contain the underlying XSS.

This risk does **not** let an ordinary member change their own role. A stolen `__session` token inherits the victim's existing identity and role; it cannot turn the attacker's Clerk user into a moderator or administrator. Issue #7 is therefore a plausible part of an incident only if an attacker executed script in an already-privileged user's browser and then acted as that victim. It does not explain an unauthorized role value appearing on the attacker's own Clerk user.

Production staff entry points do not trust the Prisma role cache. They fetch the current Clerk user on the server and authorize only `publicMetadata.role`; that field is not client-writable through Clerk's frontend SDK. Consequently, confirmed staff access by an attacker's own identity points instead to an unauthorized Clerk `publicMetadata` change, compromise or misuse of a Clerk secret/dashboard account, a pre-existing privileged session/account, or a different authorization flaw. A role badge or staff link alone is not proof of access: responders must verify whether a protected staff action actually succeeded.

### Controls and source audit

The risk is accepted only while all of these controls remain in place:

- Clerk strict CSP mode generates a per-request nonce and a `strict-dynamic` script policy. The proxy removes `unsafe-inline` from `script-src`, denies plugins and framing, restricts base URLs and form submissions to this origin, and reports violations to `/api/csp-report`.
- Automated proxy tests cover both the response and forwarded-request CSP headers, preserve the nonce and `strict-dynamic`, and reject `unsafe-inline` and `unsafe-eval` in the production script policy.
- User-authored Markdown renders through `react-markdown` with `rehype-sanitize`; it is not injected as raw HTML.
- The 2026-08-30 source audit found no application calls to Clerk `getToken()`, no reads of `document.cookie`, and no uses of `dangerouslySetInnerHTML`, direct `innerHTML`, `eval`, or `new Function` under `src/`. Clerk hooks that expose a session object are used for supported account-management and reverification flows, not to extract or persist tokens.
- Session tokens must never be copied into browser storage, application logs, analytics, URLs, error reports, or application-managed cookies. New client-side token access requires a separate security review.

CSP is defense in depth, not proof that XSS is impossible. The allowed Clerk and UploadThing network/image origins also mean CSP should not be treated as a complete exfiltration boundary.

### Rejected and alternative mitigations

- **Do not force `HttpOnly` on `__session`:** the application does not issue this cookie, and doing so is unsupported by Clerk's client-side refresh design.
- **Do not lengthen token lifetime:** this directly increases the replay window.
- **Do not depend on CSP alone:** continue output sanitization, dependency review, and injection-sink review.
- **If the residual risk becomes unacceptable:** separately design and threat-model an application-owned backend-for-frontend session. It should keep a revocable opaque credential in a `Secure`, `HttpOnly`, appropriately scoped cookie and keep Clerk tokens server-side. This is an authentication migration, not a safe in-place cookie tweak; risks include refresh/revocation correctness, CSRF, session fixation, key rotation, multi-device logout, and loss of Clerk client features.

### Operational next steps

1. Verify and record only `exp - iat` and the verification date in each production security review; expected value: 60 seconds.
2. Keep the proxy CSP regression tests in the required release gate and investigate every production CSP report for a new script source or inline execution attempt.
3. Repeat the source audit after authentication, rich-text rendering, upload, analytics, or third-party script changes. Review transitive dependencies as well as application sources.
4. For confirmed XSS, remove the vulnerable content or deployment, invalidate affected Clerk sessions, force reauthentication, rotate exposed credentials where applicable, inspect privileged-user activity, and deploy the corrected sanitization or script policy before restoring service.
5. Reassess severity if token lifetime grows, privileged accounts are exposed more broadly, CSP is weakened, or a practical injection path is found. A demonstrated unauthenticated-to-admin chain should be treated as High or Critical rather than Medium.

### Unauthorized staff-access triage

Treat a report that someone gained moderator or administrator access as an active security incident, not as confirmation of Issue #7. Preserve timestamps and identifiers, but never copy session cookies or raw JWTs into tickets or logs.

1. **Contain:** remove unauthorized roles in Clerk `publicMetadata`, revoke the suspected users' and privileged victims' sessions, temporarily suspend involved forum accounts, and restrict Clerk Dashboard access. If the change was not made by a known administrator, rotate the Clerk secret key and webhook signing secret after preserving evidence, then redeploy every service that uses them.
2. **Establish what happened:** record the attacker's Clerk user ID, forum user ID, affected privileged user IDs, first and last observed times, successful staff action IDs, and source IP/request IDs available from trusted platform logs. Distinguish a visible role badge or menu from a successful protected read or mutation.
3. **Audit Clerk:** inspect Dashboard/audit history for `publicMetadata.role` changes, administrator sign-ins, invitations, session creation/revocation, API-key activity, and configuration changes. Verify that the session claim still maps exactly from `user.public_metadata.role` and inspect all backend services capable of calling Clerk's user-update API.
4. **Audit the forum:** correlate `ModerationAction` records and application/platform request logs with Clerk session activity. Compare Clerk `publicMetadata.role`, the signed `forum_role` claim after reauthentication, and the Prisma role cache. A Prisma-only role change can affect badges and some non-sensitive presentation or limits, but should not pass `requireModerator` or `requireAdmin` in production.
5. **Test the Issue #7 hypothesis:** look for a concrete XSS injection point, CSP violation reports, an affected privileged victim browsing attacker-controlled content, and actions attributed to that victim. Without those facts, do not attribute the incident to the JavaScript-readable cookie.
6. **Recover:** remove malicious content and persistence, patch the confirmed entry point, invalidate all affected sessions, review every action performed during the window, notify affected users as appropriate, and restore roles only after clean reauthentication.

Escalate immediately to **High/Critical** if an ordinary user can modify their own trusted role, a protected staff action succeeds without current Clerk `publicMetadata` authorization, a Clerk administrative credential is exposed, or active XSS reaches a privileged user.

References: [Clerk XSS leak protection](https://clerk.com/docs/guides/secure/best-practices/xss-leak-protection), [Clerk session architecture](https://clerk.com/docs/guides/how-clerk-works/overview), and [Next.js Content Security Policy guidance](https://nextjs.org/docs/app/guides/content-security-policy).
