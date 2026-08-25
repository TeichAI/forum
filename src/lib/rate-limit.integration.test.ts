import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { consumeRateLimit, rateLimitSubject } from "@/lib/rate-limit";

describe("rate limiting against PostgreSQL", () => {
  it("admits no more than the shared burst under concurrent requests", async () => {
    const policy = { scope: "integration:concurrent", capacity: 3, refillPerSecond: 1 / 3_600 };
    const results = await Promise.all(
      Array.from({ length: 10 }, () => consumeRateLimit({ kind: "user", value: "concurrent-user" }, [policy])),
    );
    expect(results.filter((result) => result.allowed)).toHaveLength(3);
    expect(results.filter((result) => !result.allowed)).toHaveLength(7);
  });

  it("does not partially debit another bucket when one policy denies", async () => {
    const subject = rateLimitSubject({ kind: "user", value: "atomic-user" });
    const timestamp = new Date();
    await db.rateLimitBucket.createMany({ data: [
      { subject, scope: "integration:available", tokens: 5, lastRefillAt: timestamp, expiresAt: new Date(timestamp.getTime() + 60_000) },
      { subject, scope: "integration:empty", tokens: 0, lastRefillAt: timestamp, expiresAt: new Date(timestamp.getTime() + 60_000) },
    ] });

    const result = await consumeRateLimit({ kind: "user", value: "atomic-user" }, [
      { scope: "integration:available", capacity: 5, refillPerSecond: 1 / 3_600 },
      { scope: "integration:empty", capacity: 5, refillPerSecond: 1 / 3_600 },
    ]);
    expect(result.allowed).toBe(false);
    await expect(db.rateLimitBucket.findUniqueOrThrow({
      where: { subject_scope: { subject, scope: "integration:available" } },
    })).resolves.toEqual(expect.objectContaining({ tokens: 5 }));
  });
});
