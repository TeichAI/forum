import { z } from "zod";

export type ApplicationEnvironment = "development" | "production";
type RuntimeEnvironment = Readonly<Record<string, string | undefined>>;

const accessModes = new Set(["public", "restricted", "waitlist"]);
const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
const urlSchema = z.url();

export function parseApplicationEnvironment(value?: string): ApplicationEnvironment {
  const configured = value?.trim();
  if (!configured) return "production";
  if (configured === "development" || configured === "production") return configured;
  throw new Error("Invalid application environment: APP_ENV must be development or production");
}

export function applicationEnvironment(environment: RuntimeEnvironment = process.env) {
  return parseApplicationEnvironment(environment.APP_ENV);
}

export function isDeveloperMode(environment: RuntimeEnvironment = process.env) {
  return applicationEnvironment(environment) === "development";
}

function parseApplicationUrl(value: string) {
  const url = new URL(urlSchema.parse(value));
  if (url.protocol === "https:") return url;
  if (url.protocol === "http:" && loopbackHosts.has(url.hostname)) return url;
  throw new Error("NEXT_PUBLIC_APP_URL must use HTTPS or loopback HTTP");
}

export function applicationUrl(environment: RuntimeEnvironment = process.env) {
  const configured = environment.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return parseApplicationUrl(configured);
  if (isDeveloperMode(environment)) return new URL("http://localhost:3000");
  throw new Error("NEXT_PUBLIC_APP_URL is required in production");
}

export function optionalRuntimeSecret(name: "CLERK_WEBHOOK_SECRET" | "CRON_SECRET" | "UPLOADTHING_TOKEN" | "RATE_LIMIT_HASH_SECRET") {
  return process.env[name]?.trim() || null;
}

export function requireRuntimeSecret(name: "CRON_SECRET" | "RATE_LIMIT_HASH_SECRET") {
  const value = optionalRuntimeSecret(name);
  if (!value) throw new Error(`${name} is required for this operation`);
  return value;
}

export function rateLimitingConfigured() {
  return process.env.RATE_LIMITING_ENABLED !== "false";
}

function runtimeEnvironmentErrors(environment: RuntimeEnvironment, appEnvironment: ApplicationEnvironment) {
  const errors: string[] = [];
  const required = (name: string) => {
    const value = environment[name]?.trim();
    if (!value) errors.push(`${name} is required`);
    return value ?? "";
  };

  const databaseUrl = required("DATABASE_URL");
  if (databaseUrl) {
    try {
      const url = new URL(databaseUrl);
      if ((url.protocol !== "postgres:" && url.protocol !== "postgresql:") || !url.hostname) {
        errors.push("DATABASE_URL must be a PostgreSQL URL");
      }
    } catch {
      errors.push("DATABASE_URL must be a valid PostgreSQL URL");
    }
  }

  const appUrl = environment.NEXT_PUBLIC_APP_URL?.trim();
  if (appUrl) {
    try {
      parseApplicationUrl(appUrl);
    } catch {
      errors.push("NEXT_PUBLIC_APP_URL must use HTTPS or loopback HTTP");
    }
  } else if (appEnvironment === "production") {
    errors.push("NEXT_PUBLIC_APP_URL is required");
  }

  const publishableKey = required("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY");
  const secretKey = required("CLERK_SECRET_KEY");
  const publishablePrefix = appEnvironment === "development" ? "pk_test_" : "pk_live_";
  const secretPrefix = appEnvironment === "development" ? "sk_test_" : "sk_live_";
  const keyMode = appEnvironment === "development" ? "test" : "live";
  if (publishableKey && !publishableKey.startsWith(publishablePrefix)) {
    errors.push(`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY must be a ${keyMode} key`);
  }
  if (secretKey && !secretKey.startsWith(secretPrefix)) {
    errors.push(`CLERK_SECRET_KEY must be a ${keyMode} key paired with NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`);
  }

  if (appEnvironment === "production") required("CLERK_WEBHOOK_SECRET");

  const accessMode = environment.NEXT_PUBLIC_CLERK_ACCESS_MODE?.trim();
  if (accessMode && !accessModes.has(accessMode)) {
    errors.push("NEXT_PUBLIC_CLERK_ACCESS_MODE must be public, restricted, or waitlist");
  }
  if (!accessMode && appEnvironment === "production") errors.push("NEXT_PUBLIC_CLERK_ACCESS_MODE is required");

  const rateLimitSecret = environment.RATE_LIMIT_HASH_SECRET?.trim();
  if (appEnvironment === "production") {
    if (!rateLimitSecret) errors.push("RATE_LIMIT_HASH_SECRET is required");
    else if (rateLimitSecret.length < 32) errors.push("RATE_LIMIT_HASH_SECRET must contain at least 32 characters");
  }

  if (appEnvironment === "production" && environment.UPLOADTHING_TOKEN?.trim()) {
    const cronSecret = required("CRON_SECRET");
    if (cronSecret && cronSecret.length < 32) errors.push("CRON_SECRET must contain at least 32 characters when UPLOADTHING_TOKEN is configured");
  }
  return errors;
}

export function validateRuntimeEnvironment(environment: RuntimeEnvironment = process.env) {
  const appEnvironment = applicationEnvironment(environment);
  const errors = runtimeEnvironmentErrors(environment, appEnvironment);
  if (errors.length) throw new Error(`Invalid ${appEnvironment} environment: ${errors.join("; ")}`);
}
