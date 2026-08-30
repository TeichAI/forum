import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const rateLimitBucket = {
    upsert: vi.fn(),
    update: vi.fn(),
    deleteMany: vi.fn(),
  };
  const tx = { $queryRaw: vi.fn(), $executeRaw: vi.fn(), rateLimitBucket };
  const db = {
    $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    rateLimitBucket,
  };
  return { db, tx, rateLimitBucket };
});

vi.mock("@/lib/db", () => ({ db: mocks.db }));

import {
  RATE_LIMIT_POLICIES,
  consumeMutationRateLimit,
  consumeRateLimit,
  mailSendPolicies,
  mailThreadPolicy,
  memberMutationPolicies,
  railwayClientIp,
  rateLimitSubject,
  rateLimitedActionState,
} from "./rate-limit";

const now = new Date("2026-08-25T12:00:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.tx.$queryRaw.mockReset();
  mocks.rateLimitBucket.deleteMany.mockResolvedValue({ count: 0 });
  vi.spyOn(Math, "random").mockReturnValue(1);
  delete process.env.RATE_LIMITING_ENABLED;
  delete process.env.RATE_LIMIT_HASH_SECRET;
  mocks.tx.$queryRaw.mockResolvedValueOnce([{ now }]);
});

describe("rate-limit identity", () => {
  it("accepts only a valid Railway X-Real-IP value", () => {
    expect(railwayClientIp(new Headers({ "x-real-ip": "203.0.113.4" }))).toBe("203.0.113.4");
    expect(railwayClientIp(new Headers({ "x-real-ip": "2001:db8::1" }))).toBe("2001:db8::1");
    expect(railwayClientIp(new Headers({ "x-real-ip": "spoofed, 203.0.113.4" }))).toBeNull();
    expect(railwayClientIp(new Headers())).toBeNull();
  });

  it("hashes subjects without exposing the source identifier", () => {
    const hashed = rateLimitSubject({ kind: "ip", value: "203.0.113.4" });
    expect(hashed).toMatch(/^ip:/);
    expect(hashed).not.toContain("203.0.113.4");
    expect(hashed).toBe(rateLimitSubject({ kind: "ip", value: "203.0.113.4" }));
  });

  it("requires a dedicated strong production secret", () => {
    vi.stubEnv("APP_ENV", "production");
    vi.stubEnv("NODE_ENV", "production");
    expect(() => rateLimitSubject({ kind: "user", value: "user_1" })).toThrow("RATE_LIMIT_HASH_SECRET");
    vi.stubEnv("RATE_LIMIT_HASH_SECRET", "too-short");
    expect(() => rateLimitSubject({ kind: "user", value: "user_1" })).toThrow("RATE_LIMIT_HASH_SECRET");
    vi.stubEnv("RATE_LIMIT_HASH_SECRET", "a-production-secret-that-is-long-enough");
    expect(rateLimitSubject({ kind: "user", value: "user_1" })).toMatch(/^user:/);
    vi.unstubAllEnvs();
  });

  it("uses the local fallback in developer mode even in an optimized production runtime", () => {
    vi.stubEnv("APP_ENV", "development");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RATE_LIMIT_HASH_SECRET", "");
    expect(rateLimitSubject({ kind: "user", value: "user_1" })).toMatch(/^user:/);
    vi.stubEnv("APP_ENV", "production");
    expect(() => rateLimitSubject({ kind: "user", value: "user_1" })).toThrow("RATE_LIMIT_HASH_SECRET");
    vi.unstubAllEnvs();
  });
});

describe("consumeRateLimit", () => {
  it("allows an empty policy set without touching storage", async () => {
    const result = await consumeRateLimit({ kind: "user", value: "user_1" }, []);
    expect(result.allowed).toBe(true);
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
  });

  it("consumes every applicable bucket after refilling against database time", async () => {
    mocks.tx.$queryRaw.mockResolvedValueOnce([
      { subject: "hashed", scope: "a", tokens: 0, lastRefillAt: new Date(now.getTime() - 5_000) },
      { subject: "hashed", scope: "b", tokens: 4, lastRefillAt: now },
    ]);
    const result = await consumeRateLimit({ kind: "user", value: "user_1" }, [
      { scope: "b", capacity: 5, refillPerSecond: 1 },
      { scope: "a", capacity: 10, refillPerSecond: 1 },
    ]);

    expect(result).toEqual(expect.objectContaining({ allowed: true, remaining: 3, retryAfterSeconds: 0 }));
    expect(mocks.tx.$executeRaw).toHaveBeenCalledTimes(2);
    expect(mocks.rateLimitBucket.update).toHaveBeenCalledTimes(2);
    expect(mocks.rateLimitBucket.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ tokens: 4, lastRefillAt: now }) }));
  });

  it("charges a policy's explicit token cost", async () => {
    mocks.tx.$queryRaw.mockResolvedValueOnce([
      { subject: "hashed", scope: "weighted", tokens: 4, lastRefillAt: now },
    ]);
    const result = await consumeRateLimit({ kind: "user", value: "user_1" }, [
      { scope: "weighted", capacity: 5, refillPerSecond: 1, cost: 2 },
    ]);

    expect(result).toEqual(expect.objectContaining({ allowed: true, remaining: 2 }));
    expect(mocks.rateLimitBucket.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ tokens: 2 }),
    }));
  });

  it("rejects atomically and reports the longest required cooldown", async () => {
    mocks.tx.$queryRaw.mockResolvedValueOnce([
      { subject: "hashed", scope: "a", tokens: 0, lastRefillAt: now },
      { subject: "hashed", scope: "b", tokens: 0.5, lastRefillAt: now },
    ]);
    const result = await consumeRateLimit({ kind: "user", value: "user_1" }, [
      { scope: "a", capacity: 2, refillPerSecond: 0.1 },
      { scope: "b", capacity: 2, refillPerSecond: 0.5 },
    ]);

    expect(result).toEqual(expect.objectContaining({ allowed: false, retryAfterSeconds: 10, remaining: 0 }));
    expect(mocks.rateLimitBucket.update).not.toHaveBeenCalled();
    expect(rateLimitedActionState(result)).toEqual(expect.objectContaining({
      status: "rate_limited",
      message: expect.stringContaining("wait a moment"),
    }));
    expect(JSON.stringify(rateLimitedActionState(result))).not.toMatch(/10|retryAfter|resetAt|second/i);
  });

  it("fails open and logs a sanitized event when storage is unavailable", async () => {
    mocks.db.$transaction.mockRejectedValueOnce(new Error("postgresql://secret-host/database"));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = await consumeRateLimit({ kind: "ip", value: "203.0.113.4" }, [RATE_LIMIT_POLICIES.readAnonymous]);
    expect(result).toEqual(expect.objectContaining({ outcome: "allowed", allowed: true }));
    expect(log).toHaveBeenCalledWith(expect.not.stringContaining("secret-host"));
    expect(log).toHaveBeenCalledWith(expect.not.stringContaining("203.0.113.4"));
  });

  it("fails mutations closed for 30 seconds with a distinct storage outcome", async () => {
    mocks.db.$transaction.mockRejectedValueOnce(new Error("postgresql://private-host/database"));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = await consumeMutationRateLimit({ kind: "user", value: "user_1" }, [RATE_LIMIT_POLICIES.thread]);
    expect(result).toEqual(expect.objectContaining({ outcome: "storage_unavailable", allowed: false, retryAfterSeconds: 30, remaining: 0 }));
    expect(rateLimitedActionState(result)).toEqual({
      status: "error",
      message: "We couldn’t complete a temporary security check. Please wait a moment and try again.",
    });
    expect(log).toHaveBeenCalledWith(expect.not.stringContaining("private-host"));
    expect(log).toHaveBeenCalledWith(expect.not.stringContaining("user_1"));
  });

  it("fails open when storage rejects with a non-Error value", async () => {
    mocks.db.$transaction.mockRejectedValueOnce("storage unavailable");
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = await consumeRateLimit({ kind: "ip", value: "203.0.113.4" }, [RATE_LIMIT_POLICIES.readAnonymous]);

    expect(result.allowed).toBe(true);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('"error":"UnknownError"'));
  });

  it("fails open if a bucket cannot be read after initialization", async () => {
    mocks.tx.$queryRaw.mockResolvedValueOnce([]);
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = await consumeRateLimit({ kind: "user", value: "user_1" }, [RATE_LIMIT_POLICIES.thread]);

    expect(result.allowed).toBe(true);
    expect(mocks.rateLimitBucket.update).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('"error":"Error"'));
  });

  it("can be disabled without touching storage", async () => {
    process.env.RATE_LIMITING_ENABLED = "false";
    const result = await consumeRateLimit({ kind: "user", value: "user_1" }, [RATE_LIMIT_POLICIES.thread]);
    expect(result.allowed).toBe(true);
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
  });

  it("occasionally removes expired buckets without delaying the request", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    mocks.tx.$queryRaw.mockResolvedValueOnce([
      { subject: "hashed", scope: "read", tokens: 2, lastRefillAt: now },
    ]);

    const result = await consumeRateLimit({ kind: "user", value: "user_1" }, [
      { scope: "read", capacity: 2, refillPerSecond: 1 },
    ]);

    expect(result.allowed).toBe(true);
    expect(mocks.rateLimitBucket.deleteMany).toHaveBeenCalledWith({ where: { expiresAt: { lt: expect.any(Date) } } });
  });

  it("keeps successful requests fail-open when expired-bucket cleanup fails", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    mocks.rateLimitBucket.deleteMany.mockRejectedValueOnce(new Error("private database detail"));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.tx.$queryRaw.mockResolvedValueOnce([
      { subject: "hashed", scope: "read", tokens: 2, lastRefillAt: now },
    ]);

    const result = await consumeRateLimit({ kind: "user", value: "user_1" }, [
      { scope: "read", capacity: 2, refillPerSecond: 1 },
    ]);
    await vi.waitFor(() => expect(log).toHaveBeenCalled());

    expect(result.allowed).toBe(true);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('"error":"Error"'));
    expect(log).toHaveBeenCalledWith(expect.not.stringContaining("private database detail"));
  });

  it("sanitizes non-Error cleanup failures", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    mocks.rateLimitBucket.deleteMany.mockRejectedValueOnce("private database detail");
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.tx.$queryRaw.mockResolvedValueOnce([
      { subject: "hashed", scope: "read", tokens: 2, lastRefillAt: now },
    ]);

    await consumeRateLimit({ kind: "user", value: "user_1" }, [
      { scope: "read", capacity: 2, refillPerSecond: 1 },
    ]);
    await vi.waitFor(() => expect(log).toHaveBeenCalled());

    expect(log).toHaveBeenCalledWith(expect.stringContaining('"error":"UnknownError"'));
    expect(log).toHaveBeenCalledWith(expect.not.stringContaining("private database detail"));
  });

  it("does not expose server retry precision in action state", () => {
    expect(rateLimitedActionState({ outcome: "limit_exceeded", allowed: false, retryAfterSeconds: 1, remaining: 0 })).toEqual({
      status: "rate_limited",
      message: "You’re doing that a little too quickly. Please wait a moment and try again.",
    });
  });
});

describe("policy selection", () => {
  it("uses a generous single staff policy for staff and layered policies for members", () => {
    expect(memberMutationPolicies({ role: "ADMIN" }, RATE_LIMIT_POLICIES.thread)).toEqual([RATE_LIMIT_POLICIES.staff]);
    expect(memberMutationPolicies({ role: "MODERATOR" }, RATE_LIMIT_POLICIES.thread)).toEqual([RATE_LIMIT_POLICIES.staff]);
    expect(memberMutationPolicies({ role: "MEMBER" }, RATE_LIMIT_POLICIES.thread)).toEqual([
      RATE_LIMIT_POLICIES.memberMutation,
      RATE_LIMIT_POLICIES.thread,
    ]);
    expect(memberMutationPolicies({ role: "MEMBER" }, undefined, [RATE_LIMIT_POLICIES.interaction])).toEqual([
      RATE_LIMIT_POLICIES.memberMutation,
      RATE_LIMIT_POLICIES.interaction,
    ]);
  });

  it("charges Mail fan-out proportionally and scopes reply bursts per thread", () => {
    expect(mailSendPolicies({ role: "MEMBER" }, 1)).toEqual([RATE_LIMIT_POLICIES.memberMutation, { ...RATE_LIMIT_POLICIES.mail, cost: 1 }]);
    expect(mailSendPolicies({ role: "MODERATOR" }, 12)).toEqual([{ ...RATE_LIMIT_POLICIES.staff, cost: 12 }]);
    expect(mailThreadPolicy("thread")).toEqual({ scope: "mutation:mail:thread:thread", capacity: 12, refillPerSecond: 1 / 6 });
  });
});
