import { z } from "zod";

const urlSchema = z.url();

export function applicationUrl() {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return new URL(urlSchema.parse(configured));
  if (process.env.NODE_ENV === "production") throw new Error("NEXT_PUBLIC_APP_URL is required in production");
  return new URL("http://localhost:3000");
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

function productionEnvironmentErrors(environment: NodeJS.ProcessEnv) {
  const errors: string[] = [];
  const required = (name: string) => {
    const value = environment[name]?.trim();
    if (!value) errors.push(`${name} is required`);
    return value ?? "";
  };

  const databaseUrl = required("DATABASE_URL");
  if (databaseUrl && !/^postgres(?:ql)?:\/\//.test(databaseUrl)) errors.push("DATABASE_URL must be a PostgreSQL URL");

  const appUrl = required("NEXT_PUBLIC_APP_URL");
  if (appUrl) {
    try {
      if (new URL(appUrl).protocol !== "https:") errors.push("NEXT_PUBLIC_APP_URL must use HTTPS");
    } catch {
      errors.push("NEXT_PUBLIC_APP_URL must be a valid HTTPS URL");
    }
  }

  const publishableKey = required("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY");
  const secretKey = required("CLERK_SECRET_KEY");
  if (publishableKey && !publishableKey.startsWith("pk_live_")) errors.push("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY must be a live key");
  if (secretKey && !secretKey.startsWith("sk_live_")) errors.push("CLERK_SECRET_KEY must be a live key paired with NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY");
  required("CLERK_WEBHOOK_SECRET");

  const accessMode = required("NEXT_PUBLIC_CLERK_ACCESS_MODE");
  if (accessMode && !["public", "restricted", "waitlist"].includes(accessMode)) {
    errors.push("NEXT_PUBLIC_CLERK_ACCESS_MODE must be public, restricted, or waitlist");
  }

  const rateLimitSecret = required("RATE_LIMIT_HASH_SECRET");
  if (rateLimitSecret && rateLimitSecret.length < 32) errors.push("RATE_LIMIT_HASH_SECRET must contain at least 32 characters");
  if (environment.UPLOADTHING_TOKEN?.trim()) {
    const cronSecret = required("CRON_SECRET");
    if (cronSecret && cronSecret.length < 32) errors.push("CRON_SECRET must contain at least 32 characters when UPLOADTHING_TOKEN is configured");
  }
  return errors;
}

export function validateProductionEnvironment(environment: NodeJS.ProcessEnv = process.env) {
  if (environment.NODE_ENV !== "production") return;
  const errors = productionEnvironmentErrors(environment);
  if (errors.length) throw new Error(`Invalid production environment: ${errors.join("; ")}`);
}
