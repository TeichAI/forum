# syntax=docker/dockerfile:1

FROM node:22-alpine AS base

RUN apk add --no-cache openssl

WORKDIR /app


FROM base AS dependencies

COPY package.json package-lock.json ./
RUN npm ci


FROM base AS migration-tools

RUN npm install --global prisma@6.12.0


FROM base AS builder

ENV NEXT_TELEMETRY_DISABLED=1

ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_CLERK_SIGN_IN_URL
ARG NEXT_PUBLIC_CLERK_SIGN_UP_URL
ARG NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL
ARG NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL
ARG NEXT_PUBLIC_CLERK_ACCESS_MODE=public
ARG NEXT_PUBLIC_APP_URL

COPY --from=dependencies /app/node_modules ./node_modules
COPY . .

RUN npm run db:generate
RUN --mount=type=secret,id=app_env,target=/app/.env.local npm run build


FROM base AS runner

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 --ingroup nodejs nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=migration-tools /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s ../lib/node_modules/prisma/build/index.js /usr/local/bin/prisma

USER nextjs

EXPOSE 3000

CMD ["sh", "-c", "prisma migrate deploy && exec node server.js"]
