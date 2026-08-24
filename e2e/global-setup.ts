import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { clerkSetup } from "@clerk/testing/playwright";
import { cleanupIdentity, identityRecordPath, readIdentityRecord } from "./auth-cleanup";

export default async function globalSetup() {
  if (existsSync(".env.local")) loadEnvFile(".env.local");

  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!publishableKey || !secretKey) {
    throw new Error("Clerk auth E2E requires NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY in .env.local.");
  }
  if (!publishableKey.startsWith("pk_test_") || !secretKey.startsWith("sk_test_")) {
    throw new Error("Refusing to run authentication E2E against a production Clerk instance. Development pk_test_/sk_test_ keys are required.");
  }

  const staleIdentity = readIdentityRecord();
  if (staleIdentity) {
    console.log(`Cleaning up a user left by an interrupted auth run (${staleIdentity.email}; record: ${identityRecordPath}).`);
    await cleanupIdentity(staleIdentity);
  }

  await clerkSetup({ publishableKey, secretKey });
}
