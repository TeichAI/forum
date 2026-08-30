# Teich Forum

A community forum for Teich, built with Next.js, Clerk, and PostgreSQL/Prisma. UploadThing image uploads are optional.

Security reports and the documented Clerk session-token risk decision are in [SECURITY.md](SECURITY.md).

## Local setup

1. Copy `.env.example` to `.env.local`, leave `APP_ENV=development`, and fill in Clerk development-instance (`pk_test_`/`sk_test_`) and PostgreSQL credentials. `CLERK_WEBHOOK_SECRET` and `UPLOADTHING_TOKEN` can remain blank for normal local development.
2. Install dependencies with `npm install`.
3. Create the schema with `npm run db:push`.
4. Configure the Clerk role claim described below, assign an administrator in the Clerk Dashboard, start the app with `npm run dev`, and create the first space from the Spaces panel on the home page.

Signed-in users are added to the local database on their first visit, so local development does not require a webhook or a public tunnel.

## Clerk forum roles

Clerk user public metadata is the source of truth for global forum roles. In the Clerk Dashboard, customize the session token with the exact contents of [`config/clerk-session-claims.json`](config/clerk-session-claims.json):

```json
{
  "forum_role": "{{user.public_metadata.role}}"
}
```

Assign roles from a user’s public metadata in the Clerk Dashboard. Use `{"role":"admin"}` for an administrator or `{"role":"moderator"}` for a moderator. `{"role":"member"}` and an absent role both produce an ordinary member. Unknown or malformed values also fall back to member access.

The trusted authorization sources are deliberately limited:

- The signed `forum_role` session claim, sourced only from `user.public_metadata.role`, authorizes ordinary signed-in behavior and optimistic role-aware rendering.
- Server-fetched Clerk `publicMetadata.role` is the live authority for every moderator and administrator entry point. A failed verification denies staff access, so a staff downgrade takes effect immediately.
- Signed Clerk webhooks copy `public_metadata.role` into Prisma `User.role`. This database field is only a denormalized cache for public badges and bulk forum queries; production authorization must not trust it by itself.
- Local E2E identities use the database role only while the explicit, non-production E2E authentication mode is enabled.

Clerk `unsafeMetadata` (webhook field `unsafe_metadata`) is client-writable and permanently untrusted. It must never be used for authorization, copied into `forum_role`, or synchronized into the database role. User-controlled profile or preference data stored there must be validated and kept separate from trusted identity data. Role assignments cannot be changed from the forum UI; trusted role writes belong in Clerk `publicMetadata`, `privateMetadata`, or an application-owned database workflow. See Clerk’s [metadata access model](https://clerk.com/docs/guides/users/extending), [global RBAC guide](https://clerk.com/docs/guides/secure/basic-rbac), and [session-token guidance](https://clerk.com/docs/guides/sessions/customize-session-tokens).

## Clerk access modes

The custom authentication UI supports Clerk's Open, Invite-only, and Waitlist access modes. Set `NEXT_PUBLIC_CLERK_ACCESS_MODE` to the matching Clerk API value:

- `public` for Open mode. The existing email/password, GitHub, and Hugging Face signup methods remain available.
- `restricted` for Invite-only mode. Ordinary signup shows an invitation-required page, while Clerk invitation links are accepted by the custom auth routes.
- `waitlist` for Waitlist mode. Signed-out calls to action lead to the custom `/waitlist` form, and approved users finish signup from the invitation link Clerk emails them.

This public setting is compiled into the browser bundle. Change the Access mode in the Clerk Dashboard and `NEXT_PUBLIC_CLERK_ACCESS_MODE` together, then rebuild the app. Missing configuration defaults to `public`; invalid values stop the app with a configuration error. Waitlist mode also requires email to be enabled in Clerk so approved users can receive their invitations. Invitations and waitlist approvals remain managed in the Clerk Dashboard.

For Docker Compose, export the mode before building when it is not `public`, for example `NEXT_PUBLIC_CLERK_ACCESS_MODE=waitlist docker compose --env-file .env.local up --build`.

Enable Clerk’s express legal consent for every deployed instance. Configure the Terms URL as `${NEXT_PUBLIC_APP_URL}/terms` and the Privacy URL as `${NEXT_PUBLIC_APP_URL}/privacy`; the custom signup flow sends Clerk `legalAccepted: true` and can complete consent requirements that appear only after email verification.

## Docker and deployment

Use `docker compose --env-file .env.local up database` when local development needs only PostgreSQL, then run the application with `npm run dev`. A production image intentionally starts only `node server.js`; it never applies migrations from its startup command.

The optimized Docker image can also run as a developer deployment. Keep the container’s `NODE_ENV=production`, set `APP_ENV=development`, provide Clerk development-instance keys with the exact `pk_test_`/`sk_test_` pairing, and run `docker compose --env-file .env.local up --build`. Developer mode permits the loopback application URL, an omitted Clerk webhook secret, the default `public` Clerk access mode, and the local rate-limit hashing fallback. It also displays a persistent warning and disables search indexing. `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and every other `NEXT_PUBLIC_*` setting are compiled at build time, so rebuild the image whenever the public Clerk key or another public setting changes.

Always connect developer mode to an isolated, non-production PostgreSQL database. The application deliberately does not guess whether a database is safe from its hostname or database name.

Configure Railway’s pre-deploy command as `prisma migrate deploy` with the privileged migration credential mapped to `DATABASE_URL`. The running service should receive the restricted application credential instead. The Prisma CLI and committed migration files remain in the runner image for that pre-deploy command. Refresh the pinned Node Alpine multi-architecture digest whenever dependencies are updated.

`APP_ENV` accepts only `development` or `production` and defaults to `production` when missing. Production startup requires a PostgreSQL URL, an HTTPS URL (or loopback HTTP when appropriate), the exact Clerk `pk_live_`/`sk_live_` pairing, `CLERK_WEBHOOK_SECRET`, an explicit Clerk access mode, and a 32-character `RATE_LIMIT_HASH_SECRET`. Development requires the exact Clerk `pk_test_`/`sk_test_` pairing and still requires PostgreSQL. Live, test, or mixed key modes are rejected when they do not match `APP_ENV`. If `UPLOADTHING_TOKEN` is present in production, a distinct 32-character `CRON_SECRET` is also required. Startup errors name invalid variables without printing their values.

## Clerk webhook synchronization

Webhook synchronization is required in production so Clerk profile changes, public role badges, and account deletions are reflected in the forum database. In the Clerk Dashboard, create an endpoint for `https://your-domain.example/api/webhooks/clerk`, subscribe it to `user.created`, `user.updated`, and `user.deleted`, and set its signing secret as `CLERK_WEBHOOK_SECRET` in the deployed environment.

When `CLERK_WEBHOOK_SECRET` is blank or absent, the webhook endpoint is disabled and returns `404`. This is supported for local development only; public role badges can remain stale without webhook updates. To test webhooks locally, set the secret and expose the local endpoint with a tunnel.

## Optional image uploads

Set `UPLOADTHING_TOKEN` to enable the image upload button and `/api/uploadthing`. Forum images use public-read storage, while Mail images use private storage and are served only through short-lived authorized redirects. Configure `CRON_SECRET` for stale-upload maintenance. If uploads are disabled, the forum remains usable and new uploads return `503`.

## Application rate limits

The forum uses shared PostgreSQL token buckets for page reads and state-changing actions. Signed-in traffic is keyed by a one-way hash of the Clerk user ID; anonymous reads use a one-way hash of Railway's `X-Real-IP` header. Raw IP addresses are never persisted or logged.

Set `RATE_LIMIT_HASH_SECRET` to a random value of at least 32 characters in every production environment. Keep the same value across all Railway replicas. `RATE_LIMITING_ENABLED=false` is an emergency kill switch; normal deployments should leave rate limiting enabled. Limiter storage failures fail open for ordinary reads, but state-changing requests fail closed for 30 seconds and emit sanitized structured logs.

The checked-in policy favors comfortable bursts and continuously refills capacity rather than imposing fixed-window or daily quotas. Railway edge or host-level protections should still be enabled for malformed requests and volumetric attacks before they reach Next.js.

Use `/healthz` for process liveness and `/readyz` when database readiness is required. Both endpoints are unauthenticated, uncached, exempt from application read limits, and return no internal error details.

## Member visibility policy

The searchable `/members` directory is available only to active signed-in members. Individual `/members/[id]` profiles remain publicly reachable for attribution from public discussions, but they are marked `noindex, follow` and are excluded from the sitemap. Signed-out profile viewers see only the display name, username, avatar, biography, role, and public discussions; join month and follower/following counts require an active account.

Publicly active authors can still be enumerated by following attribution links from public discussions. This is an accepted residual risk of preserving understandable authorship without bulk-publishing the member directory or advertising profile URLs to search engines.

## Testing

The test suite is split into deterministic layers:

- `npm test` runs the fast Vitest unit, component, route, and App Router page suite.
- `npm run test:coverage` enforces 90% lines/statements/functions and 85% branches across all production source.
- `npm run test:critical:coverage` enforces 95% lines/statements/functions and 90% branches across authentication, server actions, queries, the request proxy, and API routes.
- `npm run test:integration` starts an ephemeral PostgreSQL 17 service on port 5433, applies migrations, and runs the serial Prisma integration suite.
- `npm run test:e2e:features` runs the isolated Chromium forum journeys on port 3100 with seeded local identities.
- `npm run test:e2e:staff` runs the isolated Chromium staff-console journeys on port 3150 with seeded member, moderator, and administrator identities.
- `npm run test:e2e:auth` runs the separate live-Clerk development-instance suite on port 3200 and requires test Clerk keys in `.env.local`.
- `npm run test:verify` runs the deterministic local quality gate, including both isolated browser suites; `npm run test:verify:external` also runs the live-Clerk suite.

Integration and isolated browser tests refuse to reset a database whose name does not contain `test`. Set `TEST_DATABASE_URL` to use an existing dedicated test database, `TEST_POSTGRES_PORT` to change the disposable Compose service port, or `KEEP_TEST_DATABASE=1` to leave that service running for troubleshooting. Local browser sessions are HMAC-signed and are accepted only with explicit E2E mode, a 32-character secret, and a non-production server.

Playwright keeps traces, screenshots, and videos only for failed tests under the ignored `test-results` and `playwright-report` directories. UploadThing behavior is exercised through local contract tests; no live UploadThing credentials are required.
