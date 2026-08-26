# Teich Forum

A community forum for Teich, built with Next.js, Clerk, and PostgreSQL/Prisma. UploadThing image uploads are optional.

## Local setup

1. Copy `.env.example` to `.env.local` and fill in the Clerk and PostgreSQL credentials. `CLERK_WEBHOOK_SECRET` and `UPLOADTHING_TOKEN` can remain blank for normal local development.
2. Install dependencies with `npm install`.
3. Create the schema with `npm run db:push`.
4. Configure the Clerk role claim described below, assign an administrator in the Clerk Dashboard, start the app with `npm run dev`, and create the first space from the Spaces panel on the home page.

Signed-in users are added to the local database on their first visit, so local development does not require a webhook or a public tunnel.

## Clerk forum roles

Clerk user public metadata is the source of truth for global forum roles. In the Clerk Dashboard, customize the session token to include this claim:

```json
{
  "forum_role": "{{user.public_metadata.role}}"
}
```

Assign roles from a user’s public metadata in the Clerk Dashboard. Use `{"role":"admin"}` for an administrator or `{"role":"moderator"}` for a moderator. `{"role":"member"}` and an absent role both produce an ordinary member. Unknown or malformed values also fall back to member access.

The signed `forum_role` session claim authorizes the current user. The Prisma `User.role` field is only a denormalized cache used for public badges and bulk forum queries. Role assignments cannot be changed from the forum UI. Clerk refreshes session claims approximately every 60 seconds, so a Dashboard role change can take up to a minute to affect an existing session. See Clerk’s [global RBAC guide](https://clerk.com/docs/guides/secure/basic-rbac) and [session-token guidance](https://clerk.com/docs/guides/sessions/customize-session-tokens).

## Clerk access modes

The custom authentication UI supports Clerk's Open, Invite-only, and Waitlist access modes. Set `NEXT_PUBLIC_CLERK_ACCESS_MODE` to the matching Clerk API value:

- `public` for Open mode. The existing email/password and GitHub signup form remains available.
- `restricted` for Invite-only mode. Ordinary signup shows an invitation-required page, while Clerk invitation links are accepted by the custom auth routes.
- `waitlist` for Waitlist mode. Signed-out calls to action lead to the custom `/waitlist` form, and approved users finish signup from the invitation link Clerk emails them.

This public setting is compiled into the browser bundle. Change the Access mode in the Clerk Dashboard and `NEXT_PUBLIC_CLERK_ACCESS_MODE` together, then rebuild the app. Missing configuration defaults to `public`; invalid values stop the app with a configuration error. Waitlist mode also requires email to be enabled in Clerk so approved users can receive their invitations. Invitations and waitlist approvals remain managed in the Clerk Dashboard.

For Docker Compose, export the mode before building when it is not `public`, for example `NEXT_PUBLIC_CLERK_ACCESS_MODE=waitlist docker compose --env-file .env.local up --build`.

## Docker Compose

1. Copy `.env.example` to `.env.local` and add your Clerk credentials. `UPLOADTHING_TOKEN` remains optional. The Compose network supplies its own `DATABASE_URL`, so the value in `.env.local` is ignored by the running container.
2. Run `docker compose --env-file .env.local up --build`.
3. Open [http://localhost:3000](http://localhost:3000).

The forum waits for PostgreSQL to be healthy and applies committed Prisma migrations before it starts. A fresh database has no spaces; sign in as a configured administrator and create the first one from the Spaces panel on the home page. Database data is kept in a named volume across restarts. Run `docker compose --env-file .env.local down` to stop the stack, or `docker compose --env-file .env.local down --volumes` to also reset its database.

Set `FORUM_PORT` or `POSTGRES_PORT` in your shell to change the exposed ports. To use a different environment file for both build arguments and the running container, set `FORUM_ENV_FILE` and pass the same path to `--env-file`, for example `FORUM_ENV_FILE=.env.staging docker compose --env-file .env.staging up --build`.

## Clerk webhook synchronization

Webhook synchronization is required in production so Clerk profile changes, public role badges, and account deletions are reflected in the forum database. In the Clerk Dashboard, create an endpoint for `https://your-domain.example/api/webhooks/clerk`, subscribe it to `user.created`, `user.updated`, and `user.deleted`, and set its signing secret as `CLERK_WEBHOOK_SECRET` in the deployed environment.

When `CLERK_WEBHOOK_SECRET` is blank or absent, the webhook endpoint is disabled and returns `404`. This is supported for local development only; public role badges can remain stale without webhook updates. To test webhooks locally, set the secret and expose the local endpoint with a tunnel.

## Optional image uploads

Set `UPLOADTHING_TOKEN` to enable the image upload button and `/api/uploadthing`. If the token is absent or blank, the forum remains fully usable, new uploads are rejected, and existing UploadThing-hosted images are hidden without deleting their Markdown or attachment records. Externally hosted Markdown images continue to render.

## Application rate limits

The forum uses shared PostgreSQL token buckets for page reads and state-changing actions. Signed-in traffic is keyed by a one-way hash of the Clerk user ID; anonymous reads use a one-way hash of Railway's `X-Real-IP` header. Raw IP addresses are never persisted or logged.

Set `RATE_LIMIT_HASH_SECRET` to a random value of at least 32 characters in every production environment. Keep the same value across all Railway replicas. `RATE_LIMITING_ENABLED=false` is an emergency fail-open kill switch; normal deployments should leave rate limiting enabled. Limiter storage failures also fail open and emit sanitized structured logs so a limiter incident does not take the forum offline.

The checked-in policy favors comfortable bursts and continuously refills capacity rather than imposing fixed-window or daily quotas. Railway edge or host-level protections should still be enabled for malformed requests and volumetric attacks before they reach Next.js.

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
