import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cookieGet = vi.hoisted(() => vi.fn());
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({ get: cookieGet })) }));

import { createE2ESessionToken, getE2ETestUserId, isE2ETestMode } from "./e2e-auth";

const secret = "a-secure-test-secret-that-is-longer-than-32-characters";

beforeEach(() => {
  vi.stubEnv("E2E_TEST_MODE", "1");
  vi.stubEnv("E2E_AUTH_SECRET", secret);
  vi.stubEnv("NODE_ENV", "test");
  cookieGet.mockReset();
});

afterEach(() => vi.unstubAllEnvs());

describe("E2E test authentication", () => {
  it("stays disabled unless explicitly enabled", async () => {
    vi.stubEnv("E2E_TEST_MODE", "0");
    expect(isE2ETestMode()).toBe(false);
    await expect(getE2ETestUserId()).resolves.toBeNull();
    expect(() => createE2ESessionToken("user-id")).toThrow("disabled");
  });

  it("refuses production mode and weak secrets", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => isE2ETestMode()).toThrow("unavailable in production");
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("E2E_AUTH_SECRET", "short");
    expect(() => isE2ETestMode()).toThrow("at least 32");
  });

  it("creates and verifies a signed, unexpired cookie", async () => {
    const token = createE2ESessionToken("local-user", Date.now() + 5_000);
    cookieGet.mockReturnValue({ value: token });
    await expect(getE2ETestUserId()).resolves.toBe("local-user");
  });

  it.each([
    undefined,
    { value: "missing-separator" },
    { value: "one.two.three" },
    { value: "eyJ1c2VySWQiOiJ4In0.invalid" },
  ])("rejects absent or malformed cookies", async (cookie) => {
    cookieGet.mockReturnValue(cookie);
    await expect(getE2ETestUserId()).resolves.toBeNull();
  });

  it("rejects expired and invalid signed payloads", async () => {
    cookieGet.mockReturnValue({ value: createE2ESessionToken("local-user", Date.now() - 1) });
    await expect(getE2ETestUserId()).resolves.toBeNull();
    const valid = createE2ESessionToken("local-user");
    const [payload, sig] = valid.split(".");
    cookieGet.mockReturnValue({ value: `${payload.slice(0, -1)}x.${sig}` });
    await expect(getE2ETestUserId()).resolves.toBeNull();
    const invalidJson = Buffer.from("not-json").toString("base64url");
    const invalidJsonSignature = createHmac("sha256", secret).update(invalidJson).digest("base64url");
    cookieGet.mockReturnValue({ value: `${invalidJson}.${invalidJsonSignature}` });
    await expect(getE2ETestUserId()).resolves.toBeNull();
  });
});
