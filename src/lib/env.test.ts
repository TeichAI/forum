import { afterEach, expect, it, vi } from "vitest";
import { applicationUrl, optionalRuntimeSecret, rateLimitingConfigured, requireRuntimeSecret, validateProductionEnvironment } from "./env";

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

const validProduction = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://database.internal/forum",
  NEXT_PUBLIC_APP_URL: "https://forum.example",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_live_public",
  CLERK_SECRET_KEY: "sk_live_secret",
  CLERK_WEBHOOK_SECRET: "whsec_webhook",
  NEXT_PUBLIC_CLERK_ACCESS_MODE: "restricted",
  RATE_LIMIT_HASH_SECRET: "r".repeat(32),
} as NodeJS.ProcessEnv;

it("accepts a complete release environment and skips optional development features", () => {
  expect(() => validateProductionEnvironment(validProduction)).not.toThrow();
  expect(() => validateProductionEnvironment({ NODE_ENV: "development" })).not.toThrow();
  expect(() => validateProductionEnvironment({ NODE_ENV: "test" })).not.toThrow();
});

it.each([
  "DATABASE_URL",
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
  "CLERK_WEBHOOK_SECRET",
  "NEXT_PUBLIC_CLERK_ACCESS_MODE",
  "RATE_LIMIT_HASH_SECRET",
])("names a missing production variable without printing values: %s", (name) => {
  const environment = { ...validProduction, [name]: "" };
  expect(() => validateProductionEnvironment(environment)).toThrow(name);
});

it("rejects non-PostgreSQL databases, non-HTTPS URLs, development Clerk keys, and invalid access modes", () => {
  const environment = {
    ...validProduction,
    DATABASE_URL: "mysql://secret-user:secret-password@database.internal/forum",
    NEXT_PUBLIC_APP_URL: "http://forum.example/private-path",
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_do-not-print",
    CLERK_SECRET_KEY: "sk_test_do-not-print",
    NEXT_PUBLIC_CLERK_ACCESS_MODE: "surprise-mode",
  };
  let message = "";
  try { validateProductionEnvironment(environment); } catch (error) { message = String(error); }
  expect(message).toContain("DATABASE_URL");
  expect(message).toContain("NEXT_PUBLIC_APP_URL");
  expect(message).toContain("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY");
  expect(message).toContain("CLERK_SECRET_KEY");
  expect(message).toContain("NEXT_PUBLIC_CLERK_ACCESS_MODE");
  expect(message).not.toContain("secret-password");
  expect(message).not.toContain("do-not-print");
  expect(message).not.toContain("private-path");
});

it("requires strong rate-limit and conditional upload maintenance secrets", () => {
  expect(() => validateProductionEnvironment({ ...validProduction, RATE_LIMIT_HASH_SECRET: "short" })).toThrow("RATE_LIMIT_HASH_SECRET");
  expect(() => validateProductionEnvironment({ ...validProduction, UPLOADTHING_TOKEN: "configured", CRON_SECRET: "" })).toThrow("CRON_SECRET");
  expect(() => validateProductionEnvironment({ ...validProduction, UPLOADTHING_TOKEN: "configured", CRON_SECRET: "short" })).toThrow("CRON_SECRET");
  expect(() => validateProductionEnvironment({ ...validProduction, UPLOADTHING_TOKEN: "configured", CRON_SECRET: "c".repeat(32) })).not.toThrow();
});
