import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applicationEnvironment,
  applicationUrl,
  isDeveloperMode,
  optionalRuntimeSecret,
  parseApplicationEnvironment,
  rateLimitingConfigured,
  requireRuntimeSecret,
  validateRuntimeEnvironment,
} from "./env";

afterEach(() => vi.unstubAllEnvs());

describe("application environment", () => {
  it("defaults missing and blank APP_ENV to production", () => {
    expect(parseApplicationEnvironment()).toBe("production");
    expect(parseApplicationEnvironment("   ")).toBe("production");
    expect(applicationEnvironment({})).toBe("production");
    expect(isDeveloperMode({ APP_ENV: "development" })).toBe(true);
  });

  it("accepts only development and production without exposing invalid values", () => {
    expect(parseApplicationEnvironment(" development ")).toBe("development");
    expect(parseApplicationEnvironment("production")).toBe("production");
    let message = "";
    try { parseApplicationEnvironment("preview-private-value"); } catch (error) { message = String(error); }
    expect(message).toContain("APP_ENV");
    expect(message).not.toContain("preview-private-value");
  });
});

describe("application URL", () => {
  it.each([
    "http://localhost:3000",
    "http://127.0.0.1:3000/path",
    "http://[::1]:3000",
    "https://forum.example.com",
  ])("accepts HTTPS and loopback HTTP: %s", (value) => {
    expect(applicationUrl({ APP_ENV: "development", NEXT_PUBLIC_APP_URL: value }).href).toBe(new URL(value).href);
  });

  it("rejects remote plain HTTP and falls back only in development", () => {
    expect(() => applicationUrl({ APP_ENV: "development", NEXT_PUBLIC_APP_URL: "http://forum.example/private-path" })).toThrow("NEXT_PUBLIC_APP_URL");
    expect(applicationUrl({ APP_ENV: "development" }).href).toBe("http://localhost:3000/");
    expect(() => applicationUrl({ APP_ENV: "production" })).toThrow("NEXT_PUBLIC_APP_URL");
  });
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
  APP_ENV: "production",
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://database.internal/forum",
  NEXT_PUBLIC_APP_URL: "https://forum.example",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_live_public",
  CLERK_SECRET_KEY: "sk_live_secret",
  CLERK_WEBHOOK_SECRET: "whsec_webhook",
  NEXT_PUBLIC_CLERK_ACCESS_MODE: "restricted",
  RATE_LIMIT_HASH_SECRET: "r".repeat(32),
} as NodeJS.ProcessEnv;

const validDevelopment = {
  APP_ENV: "development",
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://database.internal/forum_development",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_public",
  CLERK_SECRET_KEY: "sk_test_secret",
} as NodeJS.ProcessEnv;

describe("runtime environment validation", () => {
  it("accepts the complete production profile and treats missing APP_ENV as production", () => {
    expect(() => validateRuntimeEnvironment(validProduction)).not.toThrow();
    const withoutAppEnvironment = { ...validProduction };
    delete withoutAppEnvironment.APP_ENV;
    expect(() => validateRuntimeEnvironment(withoutAppEnvironment)).not.toThrow();
  });

  it("accepts the relaxed optimized developer profile", () => {
    expect(() => validateRuntimeEnvironment(validDevelopment)).not.toThrow();
    expect(() => validateRuntimeEnvironment({
      ...validDevelopment,
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      CLERK_WEBHOOK_SECRET: "",
      NEXT_PUBLIC_CLERK_ACCESS_MODE: "",
      RATE_LIMIT_HASH_SECRET: "",
      UPLOADTHING_TOKEN: "configured",
      CRON_SECRET: "",
    })).not.toThrow();
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
    expect(() => validateRuntimeEnvironment({ ...validProduction, [name]: "" })).toThrow(name);
  });

  it.each([
    ["production", "pk_test_public", "sk_test_secret"],
    ["production", "pk_live_public", "sk_test_secret"],
    ["development", "pk_live_public", "sk_live_secret"],
    ["development", "pk_test_public", "sk_live_secret"],
  ])("rejects live, test, and mixed Clerk keys outside the exact %s pairing", (appEnvironment, publishableKey, secretKey) => {
    const base = appEnvironment === "development" ? validDevelopment : validProduction;
    expect(() => validateRuntimeEnvironment({
      ...base,
      APP_ENV: appEnvironment,
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: publishableKey,
      CLERK_SECRET_KEY: secretKey,
    })).toThrow(/CLERK/);
  });

  it("rejects invalid databases, remote HTTP URLs, access modes, and weak production secrets with sanitized errors", () => {
    const environment = {
      ...validProduction,
      DATABASE_URL: "mysql://secret-user:secret-password@database.internal/forum",
      NEXT_PUBLIC_APP_URL: "http://forum.example/private-path",
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_do-not-print",
      CLERK_SECRET_KEY: "sk_test_do-not-print",
      NEXT_PUBLIC_CLERK_ACCESS_MODE: "surprise-private-mode",
      RATE_LIMIT_HASH_SECRET: "private-short-secret",
    };
    let message = "";
    try { validateRuntimeEnvironment(environment); } catch (error) { message = String(error); }
    expect(message).toContain("DATABASE_URL");
    expect(message).toContain("NEXT_PUBLIC_APP_URL");
    expect(message).toContain("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY");
    expect(message).toContain("CLERK_SECRET_KEY");
    expect(message).toContain("NEXT_PUBLIC_CLERK_ACCESS_MODE");
    expect(message).toContain("RATE_LIMIT_HASH_SECRET");
    expect(message).not.toMatch(/secret-password|do-not-print|private-path|surprise-private-mode|private-short-secret/);
  });

  it("rejects malformed and hostless PostgreSQL URLs", () => {
    expect(() => validateRuntimeEnvironment({ ...validDevelopment, DATABASE_URL: "postgresql://[broken-private-host" })).toThrow("DATABASE_URL");
    expect(() => validateRuntimeEnvironment({ ...validDevelopment, DATABASE_URL: "postgresql:relative-private-path" })).toThrow("DATABASE_URL");
  });

  it("requires the conditional production upload maintenance secret", () => {
    expect(() => validateRuntimeEnvironment({ ...validProduction, UPLOADTHING_TOKEN: "configured", CRON_SECRET: "" })).toThrow("CRON_SECRET");
    expect(() => validateRuntimeEnvironment({ ...validProduction, UPLOADTHING_TOKEN: "configured", CRON_SECRET: "short" })).toThrow("CRON_SECRET");
    expect(() => validateRuntimeEnvironment({ ...validProduction, UPLOADTHING_TOKEN: "configured", CRON_SECRET: "c".repeat(32) })).not.toThrow();
  });
});
