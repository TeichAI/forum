import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createClerkClient } from "@clerk/backend";
import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";
import { cleanupIdentity, GeneratedIdentity, identityRecordPath } from "./auth-cleanup";

test.describe.configure({ mode: "serial" });

const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
const identity: GeneratedIdentity = {
  email: `teich-e2e-${runId}+clerk_test@example.com`,
  clerkUserIds: [],
};
const originalPassword = "Teich!Test424242a";
const resetPassword = "Teich!Reset424242b";
const replacementEmail = `teich-e2e-${runId}-updated+clerk_test@example.com`;

async function signInTestUser(page: Page, email: string) {
  await page.goto("/");
  await clerk.signIn({ page, signInParams: { strategy: "email_code", identifier: email } });
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/settings(?:\?|$)/);
}

async function completeReverificationIfNeeded(page: Page, password: string) {
  const dialog = page.getByRole("dialog", { name: "Confirm it’s you" });
  await dialog.waitFor({ state: "visible", timeout: 2_000 }).catch(() => undefined);
  if (!await dialog.isVisible()) return;
  const error = dialog.getByRole("alert");
  const passwordInput = dialog.getByLabel("Password");
  const codeInput = dialog.getByLabel("Verification code");
  await expect(passwordInput.or(codeInput).or(error).first()).toBeVisible({ timeout: 20_000 });
  if (await error.isVisible()) throw new Error(`Clerk reverification failed: ${await error.innerText()}`);
  if (await passwordInput.isVisible()) await passwordInput.fill(password);
  else await codeInput.fill("424242");
  await dialog.getByRole("button", { name: "Verify" }).click();
  await expect(dialog).not.toBeVisible();
}

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

test("social connections are visible on the initial custom auth forms", async ({ page }) => {
  await page.goto("/sign-up?redirect_url=%2Fsettings");
  await expect(page.getByRole("button", { name: "Continue with GitHub" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue with Hugging Face" })).toBeVisible();

  await page.goto("/sign-in?redirect_url=%2Fsettings");
  await expect(page.getByRole("button", { name: "Continue with GitHub" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue with Hugging Face" })).toBeVisible();
});

test("custom signup validates locally, verifies email, and reaches protected settings", async ({ page }) => {
  await page.goto("/sign-up?redirect_url=%2Fsettings");
  await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue with GitHub" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue with Hugging Face" })).toBeVisible();
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
  const legal = page.getByRole("checkbox", { name: /community standards/i });
  if (await legal.isVisible()) await legal.check();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue with GitHub" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Continue with Hugging Face" })).toHaveCount(0);
  await page.getByLabel("Verification code").fill("424242");
  await page.getByRole("button", { name: "Verify and join" }).click();
  await expect(page).toHaveURL(/\/settings(?:\?|$)/);
  await expect(page.getByRole("heading", { name: "Account settings" })).toBeVisible();

  const client = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
  const users = await client.users.getUserList({ emailAddress: [identity.email] });
  identity.clerkUserIds = users.data.map((user) => user.id);
  expect(identity.clerkUserIds).toHaveLength(1);
  recordIdentity();

  await clerk.signOut({ page });
  await page.goto("/sign-in");
  await expect(page.getByRole("heading", { name: "Sign in to Teich" })).toBeVisible();
});

test("custom account center manages identity and displays active sessions", async ({ browser, page }) => {
  test.setTimeout(120_000);
  await signInTestUser(page, identity.email);

  const secondContext = await browser.newContext();
  await setupClerkTestingToken({ context: secondContext });
  const secondPage = await secondContext.newPage();
  await signInTestUser(secondPage, identity.email);
  // Keep the second session but stop its Clerk client from polling while the
  // first device performs identity operations.
  await secondPage.close();

  await page.goto("/");
  await page.getByRole("button", { name: /Account menu for/i }).click();
  await page.getByRole("link", { name: "Account settings" }).click();
  await expect(page.getByRole("heading", { name: "Account settings" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Connected accounts" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Connect GitHub" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Connect Hugging Face" })).toBeVisible();

  const avatar = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  await page.getByLabel(/Choose photo/).setInputFiles({ name: "avatar.png", mimeType: "image/png", buffer: avatar });
  await expect(page.getByRole("status").filter({ hasText: "Profile photo updated." })).toBeVisible();
  await page.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Profile photo removed." })).toBeVisible();

  await page.getByLabel("New email address").fill(replacementEmail);
  await page.getByRole("button", { name: "Change email" }).click();
  await completeReverificationIfNeeded(page, originalPassword);
  await page.getByLabel("Verification code").fill("424242");
  await page.getByRole("button", { name: "Verify email" }).click();
  await completeReverificationIfNeeded(page, originalPassword);
  await expect(page.getByRole("status").filter({ hasText: "Email address updated." })).toBeVisible();

  await expect(page.getByRole("button", { name: "Sign out device" })).toBeVisible();
  await secondContext.close();
});

test("password rejection and success preserve the requested redirect", async ({ page }) => {
  await page.goto("/sign-in?redirect_url=%2Fsettings");
  await expect(page.getByRole("button", { name: "Continue with GitHub" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue with Hugging Face" })).toBeVisible();
  await page.getByLabel("Email address").fill(replacementEmail);
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
  await expect(page.getByRole("heading", { name: "Account settings" })).toBeVisible();
  await clerk.signOut({ page });
});

test("password reset completes and authenticated auth routes redirect away", async ({ page }) => {
  await page.goto("/sign-in?redirect_url=%2Fsettings");
  await page.getByLabel("Email address").fill(replacementEmail);
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

  await page.goto("/");
  const accountTrigger = page.getByRole("button", { name: /Account menu for/i });
  const notifications = page.getByRole("link", { name: /unread notifications/i });
  let [accountBox, notificationBox] = await Promise.all([accountTrigger.boundingBox(), notifications.boundingBox()]);
  expect(accountBox?.width).toBe(40);
  expect(accountBox?.height).toBe(40);
  expect(Math.abs((accountBox!.y + accountBox!.height / 2) - (notificationBox!.y + notificationBox!.height / 2))).toBeLessThan(0.5);

  await page.setViewportSize({ width: 375, height: 812 });
  [accountBox, notificationBox] = await Promise.all([accountTrigger.boundingBox(), notifications.boundingBox()]);
  expect(accountBox?.width).toBe(40);
  expect(accountBox?.height).toBe(40);
  expect(Math.abs((accountBox!.y + accountBox!.height / 2) - (notificationBox!.y + notificationBox!.height / 2))).toBeLessThan(0.5);

  await accountTrigger.click();
  await expect(page.getByRole("navigation", { name: "Account menu" })).toBeVisible();
  const menuBox = await page.getByRole("navigation", { name: "Account menu" }).boundingBox();
  expect(menuBox!.x).toBeGreaterThanOrEqual(0);
  expect(menuBox!.x + menuBox!.width).toBeLessThanOrEqual(375);
  expect(Math.abs((menuBox!.x + menuBox!.width) - (accountBox!.x + accountBox!.width))).toBeLessThan(0.5);
  await page.getByRole("button", { name: "Sign out" }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
});

test("custom account deletion removes Clerk access and soft-deletes the forum user", async ({ page }) => {
  test.setTimeout(90_000);
  await signInTestUser(page, replacementEmail);
  const username = await page.getByLabel("Username").inputValue();
  await page.getByLabel(new RegExp(`Type ${username} to confirm`)).fill(username);
  await page.getByRole("button", { name: "Delete my account" }).click();
  await completeReverificationIfNeeded(page, resetPassword);

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();

  const userId = identity.clerkUserIds[0];
  const client = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
  await expect(client.users.getUser(userId)).rejects.toMatchObject({ status: 404 });
  const prisma = new PrismaClient();
  try {
    await expect(prisma.user.findUnique({ where: { clerkId: userId }, select: { status: true, email: true } })).resolves.toEqual({ status: "DELETED", email: null });
  } finally {
    await prisma.$disconnect();
  }
});
