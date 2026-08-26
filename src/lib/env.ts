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
