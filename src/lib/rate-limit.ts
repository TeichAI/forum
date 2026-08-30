import "server-only";

import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { optionalRuntimeSecret, rateLimitingConfigured } from "@/lib/env";

export type RateLimitPolicy = {
  scope: string;
  capacity: number;
  refillPerSecond: number;
  cost?: number;
};

export type RateLimitSubject = {
  kind: "user" | "ip";
  value: string;
};

export type RateLimitResult = {
  outcome: "allowed" | "limit_exceeded" | "storage_unavailable";
  allowed: boolean;
  retryAfterSeconds: number;
  remaining: number;
};

export type RateLimitedActionState =
  | {
    status: "rate_limited";
    message: string;
    fieldErrors?: undefined;
  }
  | {
    status: "error";
    message: string;
    fieldErrors?: undefined;
  };

export const RATE_LIMIT_POLICIES = {
  readUser: { scope: "read:user", capacity: 240, refillPerSecond: 2 },
  readAnonymous: { scope: "read:anonymous", capacity: 120, refillPerSecond: 1 },
  searchUser: { scope: "search:user", capacity: 30, refillPerSecond: 1 / 3 },
  searchAnonymous: { scope: "search:anonymous", capacity: 15, refillPerSecond: 1 / 6 },
  memberMutation: { scope: "mutation:member", capacity: 120, refillPerSecond: 1 },
  interaction: { scope: "mutation:interaction", capacity: 60, refillPerSecond: 0.5 },
  thread: { scope: "mutation:thread", capacity: 5, refillPerSecond: 1 / 600 },
  reply: { scope: "mutation:reply", capacity: 20, refillPerSecond: 1 / 60 },
  mail: { scope: "mutation:mail", capacity: 30, refillPerSecond: 1 / 3 },
  report: { scope: "mutation:report", capacity: 5, refillPerSecond: 1 / 1_800 },
  upload: { scope: "mutation:upload", capacity: 10, refillPerSecond: 1 / 360 },
  account: { scope: "mutation:account", capacity: 10, refillPerSecond: 1 / 600 },
  accountDelete: { scope: "mutation:account-delete", capacity: 3, refillPerSecond: 1 / 3_600 },
  staff: { scope: "mutation:staff", capacity: 240, refillPerSecond: 2 },
} satisfies Record<string, RateLimitPolicy>;

type BucketRow = {
  subject: string;
  scope: string;
  tokens: number;
  lastRefillAt: Date;
};

class RateLimitConfigurationError extends Error {}

function secret() {
  const configured = optionalRuntimeSecret("RATE_LIMIT_HASH_SECRET");
  if (configured && configured.length >= 32) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new RateLimitConfigurationError("RATE_LIMIT_HASH_SECRET must contain at least 32 characters in production");
  }
  return "teich-forum-local-rate-limit-secret";
}

export function rateLimitingEnabled() {
  return rateLimitingConfigured();
}

export function rateLimitSubject(subject: RateLimitSubject) {
  return `${subject.kind}:${createHmac("sha256", secret()).update(subject.value).digest("base64url")}`;
}

export function railwayClientIp(headers: Headers) {
  const value = headers.get("x-real-ip")?.trim() ?? "";
  return isIP(value) ? value : null;
}

function idleTtlSeconds(policy: RateLimitPolicy) {
  return Math.max(3_600, Math.ceil(policy.capacity / policy.refillPerSecond) + 3_600);
}

export function rateLimitedActionState(result: RateLimitResult): RateLimitedActionState {
  if (result.outcome === "storage_unavailable") {
    return {
      status: "error",
      message: "We couldn’t complete a temporary security check. Please wait a moment and try again.",
    };
  }
  return {
    status: "rate_limited",
    message: "You’re doing that a little too quickly. Please wait a moment and try again.",
  };
}

export function memberMutationPolicies(
  user: { role: string },
  policy?: RateLimitPolicy,
  additional: RateLimitPolicy[] = [],
) {
  if (user.role === "MODERATOR" || user.role === "ADMIN") return [RATE_LIMIT_POLICIES.staff];
  return [RATE_LIMIT_POLICIES.memberMutation, ...(policy ? [policy] : []), ...additional];
}

export function mailThreadPolicy(threadId: string): RateLimitPolicy {
  return { scope: `mutation:mail:thread:${threadId}`, capacity: 12, refillPerSecond: 1 / 6 };
}

export function mailSendPolicies(user: { role: string }, recipientCount: number): RateLimitPolicy[] {
  const cost = Math.max(1, recipientCount);
  if (user.role === "MODERATOR" || user.role === "ADMIN") {
    return [{ ...RATE_LIMIT_POLICIES.staff, cost }];
  }
  return [RATE_LIMIT_POLICIES.memberMutation, { ...RATE_LIMIT_POLICIES.mail, cost }];
}

export async function consumeRateLimit(
  subjectInput: RateLimitSubject,
  policies: RateLimitPolicy[],
  options: { storageFailure: "allow" | "deny" } = { storageFailure: "allow" },
): Promise<RateLimitResult> {
  if (!rateLimitingEnabled() || policies.length === 0) {
    return { outcome: "allowed", allowed: true, retryAfterSeconds: 0, remaining: Number.POSITIVE_INFINITY };
  }

  const subject = rateLimitSubject(subjectInput);
  const ordered = [...policies].sort((left, right) => left.scope.localeCompare(right.scope));

  try {
    const result = await db.$transaction(async (tx) => {
      const [{ now }] = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS "now"`;

      for (const policy of ordered) {
        const expiresAt = new Date(now.getTime() + idleTtlSeconds(policy) * 1_000);
        await tx.$executeRaw`
          INSERT INTO "RateLimitBucket" ("subject", "scope", "tokens", "lastRefillAt", "expiresAt", "updatedAt")
          VALUES (${subject}, ${policy.scope}, ${policy.capacity}, ${now}, ${expiresAt}, ${now})
          ON CONFLICT ("subject", "scope") DO NOTHING
        `;
      }

      const rows = await tx.$queryRaw<BucketRow[]>`
        SELECT "subject", "scope", "tokens", "lastRefillAt"
        FROM "RateLimitBucket"
        WHERE "subject" = ${subject} AND "scope" IN (${Prisma.join(ordered.map((policy) => policy.scope))})
        ORDER BY "scope"
        FOR UPDATE
      `;
      const byScope = new Map(rows.map((row) => [row.scope, row]));
      const calculated = ordered.map((policy) => {
        const row = byScope.get(policy.scope);
        if (!row) throw new Error(`Rate-limit bucket ${policy.scope} was not created`);
        const elapsedSeconds = Math.max(0, (now.getTime() - row.lastRefillAt.getTime()) / 1_000);
        const available = Math.min(policy.capacity, row.tokens + elapsedSeconds * policy.refillPerSecond);
        const cost = policy.cost ?? 1;
        const retryAfterSeconds = available >= cost ? 0 : Math.max(1, Math.ceil((cost - available) / policy.refillPerSecond));
        return { policy, available, cost, retryAfterSeconds };
      });
      const retryAfterSeconds = Math.max(...calculated.map((item) => item.retryAfterSeconds));
      if (retryAfterSeconds > 0) {
        return { allowed: false, retryAfterSeconds, remaining: Math.floor(Math.min(...calculated.map((item) => item.available))) };
      }

      for (const item of calculated) {
        await tx.rateLimitBucket.update({
          where: { subject_scope: { subject, scope: item.policy.scope } },
          data: {
            tokens: item.available - item.cost,
            lastRefillAt: now,
            expiresAt: new Date(now.getTime() + idleTtlSeconds(item.policy) * 1_000),
          },
        });
      }
      return {
        allowed: true,
        retryAfterSeconds: 0,
        remaining: Math.floor(Math.min(...calculated.map((item) => item.available - item.cost))),
      };
    }, { isolationLevel: "ReadCommitted" });

    if (!result.allowed) {
      console.warn(JSON.stringify({
        event: "rate_limit.denied",
        subjectType: subjectInput.kind,
        subject: subject.slice(-12),
        scopes: ordered.map((policy) => policy.scope),
        retryAfterSeconds: result.retryAfterSeconds,
      }));
    } else if (Math.random() < 0.01) {
      void db.rateLimitBucket.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch((error: unknown) => {
        console.error(JSON.stringify({ event: "rate_limit.cleanup_failed", error: error instanceof Error ? error.name : "UnknownError" }));
      });
    }
    return { ...result, outcome: result.allowed ? "allowed" : "limit_exceeded" };
  } catch (error) {
    if (error instanceof RateLimitConfigurationError) throw error;
    console.error(JSON.stringify({
      event: "rate_limit.check_failed",
      subjectType: subjectInput.kind,
      scopes: ordered.map((policy) => policy.scope),
      error: error instanceof Error ? error.name : "UnknownError",
    }));
    if (options.storageFailure === "deny") {
      return { outcome: "storage_unavailable", allowed: false, retryAfterSeconds: 30, remaining: 0 };
    }
    return { outcome: "allowed", allowed: true, retryAfterSeconds: 0, remaining: Number.POSITIVE_INFINITY };
  }
}

export function consumeMutationRateLimit(subjectInput: RateLimitSubject, policies: RateLimitPolicy[]) {
  return consumeRateLimit(subjectInput, policies, { storageFailure: "deny" });
}

export async function consumeUserMutation(
  user: { clerkId: string; role: string },
  policy?: RateLimitPolicy,
  additional: RateLimitPolicy[] = [],
) {
  return consumeMutationRateLimit({ kind: "user", value: user.clerkId }, memberMutationPolicies(user, policy, additional));
}
