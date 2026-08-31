import { describe, expect, it } from "vitest";
import { pollDurationMilliseconds, pollStatus } from "./polls";

describe("poll helpers", () => {
  it("maps duration presets and treats the expiration instant as closed", () => {
    expect(pollDurationMilliseconds("1h")).toBe(3_600_000);
    expect(pollDurationMilliseconds("30d")).toBe(30 * 24 * 3_600_000);
    const expiration = new Date("2026-09-01T00:00:00.000Z");
    expect(pollStatus(expiration, new Date("2026-08-31T23:59:59.999Z"))).toBe("ACTIVE");
    expect(pollStatus(expiration, expiration)).toBe("CLOSED");
  });
});
