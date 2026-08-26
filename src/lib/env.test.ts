import { afterEach, expect, it, vi } from "vitest";
import { applicationUrl, optionalRuntimeSecret, rateLimitingConfigured, requireRuntimeSecret } from "./env";

afterEach(() => vi.unstubAllEnvs());

it("uses the configured application URL", () => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://forum.example.com");
  expect(applicationUrl().href).toBe("https://forum.example.com/");
});

it("requires an application URL in production and falls back locally", () => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
  vi.stubEnv("NODE_ENV", "production");
  expect(() => applicationUrl()).toThrow("NEXT_PUBLIC_APP_URL");
  vi.stubEnv("NODE_ENV", "test");
  expect(applicationUrl().href).toBe("http://localhost:3000/");
});

it("validates runtime secrets only when their boundary is used", () => {
  vi.stubEnv("CRON_SECRET", "");
  expect(optionalRuntimeSecret("CRON_SECRET")).toBeNull();
  expect(() => requireRuntimeSecret("CRON_SECRET")).toThrow("CRON_SECRET");
});

it("defaults rate limiting on and accepts an explicit disable", () => {
  vi.stubEnv("RATE_LIMITING_ENABLED", "true");
  expect(rateLimitingConfigured()).toBe(true);
  vi.stubEnv("RATE_LIMITING_ENABLED", "false");
  expect(rateLimitingConfigured()).toBe(false);
});
