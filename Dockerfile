# syntax=docker/dockerfile:1

FROM node:22-alpine AS base

RUN apk add --no-cache openssl

WORKDIR /app


FROM base AS dependencies

COPY package.json package-lock.json ./
RUN npm ci


FROM base AS builder

ENV NEXT_TELEMETRY_DISABLED=1

ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_CLERK_SIGN_IN_URL
ARG NEXT_PUBLIC_CLERK_SIGN_UP_URL
ARG NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL
ARG NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL
ARG NEXT_PUBLIC_APP_URL

COPY --from=dependencies /app/node_modules ./node_modules
COPY . .

RUN npm run db:generate
RUN npm run build


FROM base AS runner

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 --ingroup nodejs nextjs

COPY --from=builder --chown=nextjs:nodejs /app ./

USER nextjs

EXPOSE 3000

CMD ["sh", "-c", "npm run db:deploy && npm run db:seed && exec npm run start"]
