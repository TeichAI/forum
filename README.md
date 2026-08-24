# Teich Forum

A community forum for Teich, built with Next.js, Clerk, and PostgreSQL/Prisma. UploadThing image uploads are optional.

## Local setup

1. Copy `.env.example` to `.env.local` and fill in the Clerk and PostgreSQL credentials. Add `UPLOADTHING_TOKEN` only if image uploads should be enabled.
2. Install dependencies with `npm install`.
3. Create the schema with `npm run db:push` and seed starter categories with `npm run db:seed`.
4. In Clerk, point a webhook at `/api/webhooks/clerk` and subscribe to `user.created`, `user.updated`, and `user.deleted`.
5. Start the app with `npm run dev`.

The first matching Clerk ID in `ADMIN_CLERK_USER_IDS` is promoted to administrator when their local user record is created or synchronized.

## Docker Compose

1. Copy `.env.example` to `.env.local` and add your Clerk credentials. `UPLOADTHING_TOKEN` remains optional. The Compose network supplies its own `DATABASE_URL`, so the value in `.env.local` is ignored by the running container.
2. Run `docker compose up --build`.
3. Open [http://localhost:3000](http://localhost:3000).

The forum waits for PostgreSQL to be healthy, applies committed Prisma migrations, and seeds the starter categories before it starts. Database data is kept in a named volume across restarts. Run `docker compose down` to stop the stack, or `docker compose down --volumes` to also reset its database.

Set `FORUM_PORT` or `POSTGRES_PORT` in your shell to change the exposed ports. To use a different environment file, set `FORUM_ENV_FILE` to its path before running Compose.

## Optional image uploads

Set `UPLOADTHING_TOKEN` to enable the image upload button and `/api/uploadthing`. If the token is absent or blank, the forum remains fully usable, new uploads are rejected, and existing UploadThing-hosted images are hidden without deleting their Markdown or attachment records. Externally hosted Markdown images continue to render.
