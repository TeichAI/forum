import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createClerkClient } from "@clerk/backend";
import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, test } from "@playwright/test";
import { cleanupIdentity, GeneratedIdentity, identityRecordPath } from "./auth-cleanup";

test.describe.configure({ mode: "serial" });

const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
const identity: GeneratedIdentity = {
  email: `teich-e2e-${runId}+clerk_test@example.com`,
  clerkUserIds: [],
};
const originalPassword = "Teich!Test424242a";
const resetPassword = "Teich!Reset424242b";

function recordIdentity() {
  mkdirSync(dirname(identityRecordPath), { recursive: true });
  writeFileSync(identityRecordPath, `${JSON.stringify(identity, null, 2)}\n`, "utf8");
}

test.beforeAll(() => {
  recordIdentity();
  console.log(`Clerk E2E generated identity: ${identity.email}`);
});

test.beforeEach(async ({ context }) => {
  await setupClerkTestingToken({ context });
});

test.afterAll(async () => {
  await cleanupIdentity(identity);
});

test("GitHub connection is visible on the initial custom auth forms", async ({ page }) => {
  await page.goto("/sign-up?redirect_url=%2Fsettings");
  await expect(page.getByRole("button", { name: "Continue with GitHub" })).toBeVisible();

  await page.goto("/sign-in?redirect_url=%2Fsettings");
  await expect(page.getByRole("button", { name: "Continue with GitHub" })).toBeVisible();
});

test("custom signup validates locally, verifies email, and reaches protected settings", async ({ page }) => {
  await page.goto("/sign-up?redirect_url=%2Fsettings");
  await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue with GitHub" })).toBeVisible();
  await expect(page.locator("#clerk-captcha")).toBeAttached();

  const firstName = page.getByLabel("First name");
  if (await firstName.isVisible()) await firstName.fill("Clerk");
  const lastName = page.getByLabel("Last name");
  if (await lastName.isVisible()) await lastName.fill("Tester");
  await page.getByLabel("Email address").fill(identity.email);
  await page.getByLabel("Password", { exact: true }).fill(originalPassword);
  await page.getByLabel("Confirm password").fill("does-not-match");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Those passwords do not match." })).toBeVisible();

  await page.getByLabel("Confirm password").fill(originalPassword);
  const legal = page.getByRole("checkbox", { name: /community guidelines/i });
  if (await legal.isVisible()) await legal.check();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue with GitHub" })).toHaveCount(0);
  await page.getByLabel("Verification code").fill("424242");
  await page.getByRole("button", { name: "Verify and join" }).click();
  await expect(page).toHaveURL(/\/settings(?:\?|$)/);
  await expect(page.getByRole("heading", { name: "Edit your profile" })).toBeVisible();

  const client = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
  const users = await client.users.getUserList({ emailAddress: [identity.email] });
  identity.clerkUserIds = users.data.map((user) => user.id);
  expect(identity.clerkUserIds).toHaveLength(1);
  recordIdentity();

  await clerk.signOut({ page });
  await page.goto("/sign-in");
  await expect(page.getByRole("heading", { name: "Sign in to Teich" })).toBeVisible();
});

test("password rejection and success preserve the requested redirect", async ({ page }) => {
  await page.goto("/sign-in?redirect_url=%2Fsettings");
  await expect(page.getByRole("button", { name: "Continue with GitHub" })).toBeVisible();
  await page.getByLabel("Email address").fill(identity.email);
  await page.getByLabel("Password", { exact: true }).fill("definitely-wrong");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator('[role="alert"]').filter({ hasText: /\S/ })).toBeVisible();

  await page.getByLabel("Password", { exact: true }).fill(originalPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  const mfaCode = page.getByLabel("Verification code");
  await mfaCode.waitFor({ state: "visible", timeout: 3_000 }).catch(() => undefined);
  if (await mfaCode.isVisible()) {
    await mfaCode.fill("424242");
    await page.getByRole("button", { name: "Verify code" }).click();
  }
  await expect(page).toHaveURL(/\/settings(?:\?|$)/);
  await expect(page.getByRole("heading", { name: "Edit your profile" })).toBeVisible();
  await clerk.signOut({ page });
});

test("password reset completes and authenticated auth routes redirect away", async ({ page }) => {
  await page.goto("/sign-in?redirect_url=%2Fsettings");
  await page.getByLabel("Email address").fill(identity.email);
  await page.getByRole("button", { name: "Forgot password?" }).click();
  await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();
  await page.getByLabel("Verification code").fill("424242");
  await page.getByRole("button", { name: "Verify code" }).click();
  await page.getByLabel("New password").fill(resetPassword);
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page).toHaveURL(/\/settings(?:\?|$)/);

  await page.goto("/sign-in?redirect_url=%2Fsettings");
  await expect(page).toHaveURL(/\/settings(?:\?|$)/);
  await page.goto("/sign-up?redirect_url=%2Fsettings");
  await expect(page).toHaveURL(/\/settings(?:\?|$)/);
});
