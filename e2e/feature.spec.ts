import { createHmac } from "node:crypto";
import { expect, test, type BrowserContext } from "@playwright/test";
import { featureIds } from "./feature-global-setup";

test.describe.configure({ mode: "serial" });

const baseUrl = `http://localhost:${process.env.E2E_PORT ?? "3100"}`;
const secret = process.env.E2E_AUTH_SECRET!;
let createdThreadUrl = "";
let announcementThreadUrl = "";
let adminOnlyThreadUrl = "";

function sessionToken(userId: string) {
  const payload = Buffer.from(JSON.stringify({ userId, expiresAt: Date.now() + 30 * 60_000 })).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

async function useIdentity(context: BrowserContext, userId: string) {
  await context.addCookies([{ name: "teich_e2e_session", value: sessionToken(userId), url: baseUrl, httpOnly: true, sameSite: "Lax" }]);
}

test("legal documents are public, linked, and responsive", async ({ page }) => {
  await page.goto("/terms");
  await expect(page).toHaveTitle("Terms of Service · Teich Forum");
  await expect(page.getByRole("heading", { level: 1, name: "Terms of Service" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Community standards and acceptable use" })).toBeVisible();
  await expect(page.locator(".legal-sidebar")).toBeVisible();
  const footer = page.getByRole("contentinfo");
  await expect(footer.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy");
  expect((await footer.boundingBox())?.height).toBeLessThanOrEqual(48);

  await footer.getByRole("link", { name: "Privacy Policy" }).click();
  await expect(page).toHaveTitle("Privacy Policy · Teich Forum");
  await expect(page.getByRole("heading", { level: 1, name: "Privacy Policy" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Retention and account deletion" })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".legal-sidebar")).toBeHidden();
  await expect(page.locator(".legal-mobile-toc")).toBeVisible();
  await page.locator(".legal-mobile-toc summary").click();
  await expect(page.locator(".legal-mobile-toc").getByRole("link", { name: "Information we collect" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("anonymous visitors can discover public content", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Ideas grow better/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Welcome to the test pond" })).toBeVisible();
  await page.getByRole("link", { name: "General", exact: true }).first().click();
  await expect(page).toHaveURL(/\/c\/general$/);
  await expect(page.getByRole("heading", { name: "Welcome to the test pond" })).toBeVisible();
  await page.goto("/search?q=healthy");
  await expect(page.getByText(/1 result for/)).toBeVisible();
  await page.getByRole("heading", { name: "Welcome to the test pond" }).click();
  await expect(page.getByRole("link", { name: "Sign in to reply" })).toBeVisible();
});

test("a member updates their profile and publishes a tagged discussion", async ({ context, page }) => {
  await useIdentity(context, featureIds.member);
  await page.goto("/settings");
  await page.getByLabel("Display name").fill("Updated Pond Member");
  await page.getByLabel("Bio").fill("Building a well-tested pond.");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByRole("status")).toHaveText("Profile saved.");
  await page.goto(`/members/${featureIds.member}`);
  await expect(page.getByRole("heading", { name: "Updated Pond Member" })).toBeVisible();

  await page.goto("/c/general");
  await page.getByRole("main").getByRole("button", { name: "New thread" }).click();
  await expect(page).toHaveURL(/\/c\/general$/);
  await expect(page.getByRole("dialog", { name: "Start a discussion" })).toBeVisible();
  await expect(page.getByLabel("Space")).toHaveValue(featureIds.category);
  await page.getByLabel("Title").fill("How should we test community discussions?");
  await page.getByLabel(/Tags/).fill("Testing, next js, testing");
  await page.getByRole("dialog").locator('textarea[name="body"]').fill("A detailed browser-tested post for @pond_other.");
  await page.getByRole("button", { name: "Publish discussion" }).click();
  await expect(page).toHaveURL(/\/t\/how-should-we-test-community-discussions-/);
  createdThreadUrl = page.url();
  await expect(page.getByRole("heading", { name: "How should we test community discussions?" })).toBeVisible();
  await expect(page.getByRole("link", { name: "#testing" })).toBeVisible();
  await expect(page.getByRole("link", { name: "#next js" })).toBeVisible();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("button", { name: "Saved" })).toBeVisible();

  const missingPage = await page.goto("/new");
  expect(missingPage?.status()).toBe(404);
});

test("another member replies, votes, follows, and starts a private conversation", async ({ context, page }) => {
  await useIdentity(context, featureIds.other);
  await page.goto(createdThreadUrl);
  await page.getByPlaceholder("Write a thoughtful reply…").fill("A thoughtful reply for @pond_member from the second member.");
  await page.getByRole("button", { name: "Post reply" }).click();
  await expect(page.getByText(/A thoughtful reply for @pond_member/)).toBeVisible();
  const threadVoteForm = page.locator('form:has(input[name="threadId"])').first();
  await threadVoteForm.getByRole("button").click();

  await page.goto(`/members/${featureIds.member}`);
  await page.getByRole("button", { name: "Follow" }).click();
  await expect(page.getByRole("button", { name: "Following" })).toBeVisible();
  await page.getByRole("button", { name: "Message" }).click();
  await expect(page).toHaveURL(/\/messages\//);
  await page.getByPlaceholder("Message Updated Pond Member…").fill("A private hello from Pond Other.");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("A private hello from Pond Other.")).toBeVisible();
});

test("the recipient sees notifications and can report content for staff review", async ({ context, page }) => {
  await useIdentity(context, featureIds.member);
  await page.goto("/notifications");
  await expect(page.getByText(/replied to your discussion/)).toBeVisible();
  await expect(page.getByText(/upvoted your post/)).toBeVisible();
  await expect(page.getByText(/started following you/)).toBeVisible();
  await expect(page.getByText(/mentioned you/)).toBeVisible();
  await page.getByRole("button", { name: /Mark all read/ }).click();
  await expect(page.getByRole("button", { name: /Mark all read/ })).toHaveCount(0);

  await page.goto("/messages");
  await page.getByRole("link", { name: /Pond Other/ }).click();
  await expect(page.getByText("A private hello from Pond Other.")).toBeVisible();

  await page.goto(createdThreadUrl);
  const report = page.locator("details").filter({ has: page.locator('input[name="targetType"][value="THREAD"]') });
  await report.locator("summary").click();
  await expect(report.getByLabel("Reason")).toBeInViewport({ ratio: 1 });
  await expect(report.getByLabel("Details")).toBeInViewport({ ratio: 0.75 });
  await report.getByLabel("Reason").selectOption({ label: "Off topic" });
  await report.getByLabel("Details").fill("Please review this browser-generated report.");
  await report.getByRole("button", { name: "Send report" }).click();
});

test("an administrator reviews, hides, resolves, and locks reported content", async ({ context, page }) => {
  await useIdentity(context, featureIds.admin);
  await page.goto("/moderation");
  await expect(page).toHaveURL(/\/staff\/reports$/);
  await page.getByRole("link", { name: /thread report/i }).click();
  await expect(page.getByText("Please review this browser-generated report.")).toBeVisible();
  const contentAction = page.getByRole("heading", { name: "Content action" }).locator("..");
  await contentAction.locator('select[name="action"]').selectOption("HIDE");
  await contentAction.getByPlaceholder("Reason").fill("Confirmed report");
  await contentAction.getByRole("button", { name: "Apply action" }).click();
  await expect(page.getByText("Please review this browser-generated report.")).toBeVisible();
  await page.getByPlaceholder("Resolution note").fill("Reviewed in the feature journey");
  await page.getByRole("button", { name: "Resolve" }).click();
  await expect(page.getByText("Case resolved.")).toBeVisible();

  await page.goto(createdThreadUrl);
  await expect(page.getByRole("heading", { name: "How should we test community discussions?" })).toBeVisible();
  await page.getByRole("button", { name: "Lock" }).click();
  await expect(page.getByText("This discussion is locked.")).toBeVisible();

  await page.goto("/staff/spaces");
  let createSpace = page.locator("details").filter({ hasText: "Create a space" });
  await createSpace.locator("summary").click();
  await createSpace.getByLabel("Name").fill("Community News");
  await createSpace.getByLabel("Description").fill("Announcements members can discuss.");
  await createSpace.getByLabel("Color").fill("#336699");
  await createSpace.getByLabel("Posting permissions").selectOption("ANNOUNCEMENTS");
  await createSpace.getByRole("button", { name: "Create space" }).click();
  await expect(page.getByText("Space created.")).toBeVisible();
  await page.goto("/");
  await page.locator('a[href="/c/community-news"]').first().click();
  await page.getByRole("main").getByRole("button", { name: "New thread" }).click();
  await page.getByLabel("Title").fill("A community announcement");
  await page.getByRole("dialog").locator('textarea[name="body"]').fill("An update that members can discuss.");
  await page.getByRole("button", { name: "Publish discussion" }).click();
  await expect(page).toHaveURL(/\/t\/a-community-announcement-/);
  announcementThreadUrl = page.url();

  await page.goto("/staff/spaces");
  createSpace = page.locator("details").filter({ hasText: "Create a space" });
  await createSpace.locator("summary").click();
  await createSpace.getByLabel("Name").fill("Staff Notices");
  await createSpace.getByLabel("Description").fill("Read-only notices from administrators.");
  await createSpace.getByLabel("Color").fill("#663399");
  await createSpace.getByLabel("Posting permissions").selectOption("ADMIN_ONLY");
  await createSpace.getByRole("button", { name: "Create space" }).click();
  await expect(page.getByText("Space created.")).toBeVisible();
  await page.goto("/");
  await page.locator('a[href="/c/staff-notices"]').first().click();
  await page.getByRole("main").getByRole("button", { name: "New thread" }).click();
  await page.getByLabel("Title").fill("An administrator notice");
  await page.getByRole("dialog").locator('textarea[name="body"]').fill("Only administrators can reply here.");
  await page.getByRole("button", { name: "Publish discussion" }).click();
  await expect(page).toHaveURL(/\/t\/an-administrator-notice-/);
  adminOnlyThreadUrl = page.url();
});

test("space policies deny member posting while announcements still accept replies", async ({ context, page }) => {
  await useIdentity(context, featureIds.member);

  await page.goto("/c/staff-notices");
  await expect(page.getByText("Only admins can start discussions or reply here.")).toBeVisible();
  await expect(page.getByRole("main").getByRole("button", { name: "New thread" })).toHaveCount(0);

  await page.goto(adminOnlyThreadUrl);
  await expect(page.getByRole("heading", { name: "Replies are limited to admins" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Post reply" })).toHaveCount(0);

  await page.goto(announcementThreadUrl);
  await page.getByPlaceholder("Write a thoughtful reply…").fill("Members can discuss announcements.");
  await page.getByRole("button", { name: "Post reply" }).click();
  await expect(page.getByText("Members can discuss announcements.")).toBeVisible();

  await page.getByRole("button", { name: "New thread" }).click();
  const spaceOptions = page.getByLabel("Space").locator("option");
  await expect(spaceOptions.filter({ hasText: "Community News" })).toHaveCount(0);
  await expect(spaceOptions.filter({ hasText: "Staff Notices" })).toHaveCount(0);
});
