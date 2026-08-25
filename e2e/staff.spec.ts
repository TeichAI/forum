import { createHmac } from "node:crypto";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { staffIds } from "./staff-global-setup";

test.describe.configure({ mode: "serial" });

const baseUrl = `http://localhost:${process.env.STAFF_E2E_PORT ?? "3150"}`;
const secret = process.env.E2E_AUTH_SECRET!;

function sessionToken(userId: string) {
  const payload = Buffer.from(JSON.stringify({ userId, expiresAt: Date.now() + 30 * 60_000 })).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

async function useIdentity(context: BrowserContext, userId: string) {
  await context.addCookies([{ name: "teich_e2e_session", value: sessionToken(userId), url: baseUrl, httpOnly: true, sameSite: "Lax" }]);
}

async function applyContentAction(page: Page, kind: "thread" | "reply", action: string, reason: string) {
  await page.getByLabel(`${kind} moderation action`).selectOption(action);
  await page.getByLabel(`${kind} moderation reason`).fill(reason);
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByRole("status").filter({ hasText: `${action.toLowerCase()} action completed.` })).toBeVisible();
}

test("anonymous users and ordinary members cannot enter the staff console", async ({ browser, request }) => {
  const anonymous = await request.get("/staff", { maxRedirects: 0 });
  expect(anonymous.status()).toBe(307);
  expect(anonymous.headers().location).toBe("/sign-in");

  const context = await browser.newContext();
  await useIdentity(context, staffIds.member);
  const memberPage = await context.newPage();
  await memberPage.goto("/staff");
  await expect(memberPage).toHaveURL(baseUrl + "/");
  await context.close();
});

test("moderators see only moderation navigation, member identity data, and moderator audit events", async ({ context, page }) => {
  await useIdentity(context, staffIds.moderator);
  await page.goto("/staff");
  await expect(page.getByRole("heading", { name: "Community operations" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Reports" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Spaces" })).toHaveCount(0);
  await expect(page.getByText("Seeded administrative audit event")).toHaveCount(0);

  await page.goto("/staff/members?q=Staff+Test+Member");
  await expect(page.getByText("Staff Test Member")).toBeVisible();
  await expect(page.getByText("member@staff.test")).toHaveCount(0);

  await page.goto("/staff/audit");
  await expect(page.getByText("Seeded moderator audit event")).toBeVisible();
  await expect(page.getByText("Seeded administrative audit event")).toHaveCount(0);

  await page.goto("/staff/spaces");
  await expect(page).toHaveURL(baseUrl + "/");
});

test("a moderator filters, claims, annotates, acts on, and resolves a report case", async ({ context, page }) => {
  await useIdentity(context, staffIds.moderator);
  await page.goto("/staff/reports?priority=HIGH&assignee=unassigned");
  await expect(page.getByText("2 reports")).toBeVisible();
  await page.getByRole("link", { name: /thread report/i }).click();
  await expect(page.getByText("Seeded browser report details.")).toBeVisible();

  await page.getByRole("button", { name: "Claim case" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Case assigned to you." })).toBeVisible();
  await page.getByLabel("Case priority").selectOption("URGENT");
  await page.getByRole("button", { name: "Update priority" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Priority updated." })).toBeVisible();
  await page.getByLabel("Private case note").fill("Browser-verified internal context.");
  await page.getByRole("button", { name: "Add private note" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Private staff note added." })).toBeVisible();

  await page.getByLabel("Content moderation action").selectOption("HIDE");
  await page.getByLabel("Content moderation reason").fill("Confirmed by browser review");
  await page.getByRole("button", { name: "Apply action" }).click();
  await expect(page.getByRole("status").filter({ hasText: "hide action completed." })).toBeVisible();
  await page.getByLabel("Resolution note").fill("Resolved in the isolated staff suite");
  await page.getByRole("button", { name: "Resolve" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Case resolved." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reopen case" })).toBeVisible();
});

test("thread and reply moderation transitions affect public visibility and notifications", async ({ browser, context, page }) => {
  await useIdentity(context, staffIds.moderator);
  const memberContext = await browser.newContext();
  await useIdentity(memberContext, staffIds.member);
  const memberPage = await memberContext.newPage();

  const hiddenResponse = await memberPage.goto("/t/staff-browser-reported-thread");
  expect(hiddenResponse?.status()).toBe(404);

  await page.goto("/staff/content?q=Staff+browser+reported&type=THREAD");
  await applyContentAction(page, "thread", "RESTORE", "Restore after review");
  await memberPage.goto("/t/staff-browser-reported-thread");
  await expect(memberPage.getByRole("heading", { name: "Staff browser reported thread" })).toBeVisible();

  await applyContentAction(page, "thread", "LOCK", "Pause replies");
  await memberPage.reload();
  await expect(memberPage.getByText("This discussion is locked.")).toBeVisible();
  await applyContentAction(page, "thread", "UNLOCK", "Resume replies");
  await applyContentAction(page, "thread", "PIN", "Feature this discussion");
  await applyContentAction(page, "thread", "UNPIN", "Return to normal ordering");

  await page.goto("/staff/content?q=seeded+reply&type=REPLY");
  await applyContentAction(page, "reply", "HIDE", "Hide reported reply");
  await memberPage.reload();
  await expect(memberPage.locator(`#reply-${staffIds.reply}`)).toHaveCount(0);
  await applyContentAction(page, "reply", "RESTORE", "Restore reported reply");
  await memberPage.reload();
  await expect(memberPage.locator(`#reply-${staffIds.reply} p`).filter({ hasText: "A seeded reply for staff review." })).toBeVisible();

  await memberPage.goto("/notifications");
  await expect(memberPage.getByText("Reason: Restore reported reply")).toBeVisible();
  await expect(memberPage.getByText("Reason: Pause replies")).toBeVisible();
  await memberContext.close();
});

test("member notes and suspension controls respect deleted and protected accounts", async ({ context, page }) => {
  await useIdentity(context, staffIds.admin);
  await page.goto(`/staff/members/${staffIds.member}`);
  await expect(page.getByText("member@staff.test")).toBeVisible();
  await page.getByLabel("Private staff note").fill("Durable browser-tested member note.");
  await page.getByRole("button", { name: "Add private note" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Private staff note added." })).toBeVisible();
  await page.getByLabel("Suspension duration").selectOption("7");
  await page.getByLabel("Account moderation reason").fill("Repeated browser-tested violations");
  await page.getByRole("button", { name: "Suspend member" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Member suspended." })).toBeVisible();
  await expect(page.getByText("suspended", { exact: true })).toBeVisible();
  await page.getByLabel("Account moderation reason").fill("Appeal accepted in browser test");
  await page.getByRole("button", { name: "Unsuspend member" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Member restored." })).toBeVisible();

  await page.goto(`/staff/members/${staffIds.deleted}`);
  await expect(page.getByText(/deleted and cannot be moderated or reactivated/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /suspend member/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add private note" })).toHaveCount(0);

  const moderatorContext = await page.context().browser()!.newContext();
  await useIdentity(moderatorContext, staffIds.moderator);
  const moderatorPage = await moderatorContext.newPage();
  await moderatorPage.goto(`/staff/reports/${staffIds.protectedCase}`);
  await expect(moderatorPage.getByText(/protected by the role hierarchy/i)).toBeVisible();
  await expect(moderatorPage.getByRole("heading", { name: "Member action" })).toHaveCount(0);
  await moderatorContext.close();
});

test("administrators manage spaces, tags, presets, and the complete audit log", async ({ context, page }) => {
  await useIdentity(context, staffIds.admin);
  await page.goto("/staff/spaces");
  await expect(page.getByRole("link", { name: "Spaces" })).toBeVisible();
  const createSpace = page.locator("details").filter({ hasText: "Create a space" });
  await createSpace.locator("summary").click();
  await createSpace.getByLabel("Name").fill("Browser Operations");
  await createSpace.getByLabel("Description").fill("A space managed entirely through staff browser coverage.");
  await createSpace.getByLabel("Color").fill("#336699");
  await createSpace.getByLabel("Posting permissions").selectOption("ANNOUNCEMENTS");
  await createSpace.getByRole("button", { name: "Create space" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Space created." })).toBeVisible();

  let space = page.locator("article").filter({ hasText: "Browser Operations" });
  await space.getByLabel("Description").fill("Updated through the isolated staff suite.");
  await space.getByRole("button", { name: "Save changes" }).click();
  await expect(space.getByRole("status").filter({ hasText: "Space updated." })).toBeVisible();
  await space.getByRole("button", { name: "Archive space" }).click();
  await expect(space.getByRole("status").filter({ hasText: "Space archived." })).toBeVisible();
  space = page.locator("article").filter({ hasText: "Browser Operations" });
  await space.getByRole("button", { name: "Restore space" }).click();
  await expect(space.getByRole("status").filter({ hasText: "Space restored." })).toBeVisible();

  await page.goto("/staff/tags?q=Legacy");
  await page.getByLabel("Rename Legacy Topic").fill("Legacy Browser Topic");
  await page.getByRole("button", { name: "Rename" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Tag renamed; its URL remains unchanged." })).toBeVisible();
  await page.getByLabel("Merge Legacy Browser Topic into").selectOption({ label: "Canonical Topic" });
  await page.getByRole("button", { name: "Merge" }).click();
  await expect(page.getByText("#Legacy Browser Topic")).toHaveCount(0);
  await page.goto("/tag/legacy-topic");
  await expect(page).toHaveURL(/\/tag\/canonical-topic$/);

  await page.goto("/staff/settings/moderation");
  await page.getByLabel("Report reasons").fill("Spam\nSafety concern\nOther");
  await page.getByLabel("Suspension durations in days").fill("2, 7, 21");
  await page.getByLabel("Reusable action reasons").fill("Safety concern\nAppeal accepted\nOther");
  await page.getByRole("button", { name: "Save presets" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Moderation presets saved." })).toBeVisible();
  await expect(page.getByLabel("Suspension durations in days")).toHaveValue("2, 7, 21");

  await page.goto("/staff/audit?q=Seeded+administrative");
  await expect(page.getByText("Seeded administrative audit event")).toBeVisible();
});

test("staff can review limited private-Mail context and empty filtered states", async ({ context, page }) => {
  await useIdentity(context, staffIds.moderator);
  await page.goto(`/staff/reports/${staffIds.messageCase}`);
  await expect(page.getByText("Private context is limited to two mail entries on either side.")).toBeVisible();
  await expect(page.getByText("A private seeded Mail entry with deliberately limited staff context.")).toBeVisible();

  await page.goto("/staff/reports?q=no-such-report-value");
  await expect(page.getByText("No cases match these filters.")).toBeVisible();
  await page.goto("/staff/content?q=no-such-content-value");
  await expect(page.getByText("No content matches these filters.")).toBeVisible();
  await page.goto("/staff/members?q=no-such-member-value");
  await expect(page.getByText("No members match these filters.")).toBeVisible();
});
