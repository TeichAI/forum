import { createHmac } from "node:crypto";
import { expect, test, type BrowserContext } from "@playwright/test";
import { featureIds } from "./feature-global-setup";

test.describe.configure({ mode: "serial" });

const baseUrl = `http://localhost:${process.env.E2E_PORT ?? "3100"}`;
const secret = process.env.E2E_AUTH_SECRET!;
let createdThreadUrl = "";

function sessionToken(userId: string) {
  const payload = Buffer.from(JSON.stringify({ userId, expiresAt: Date.now() + 30 * 60_000 })).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

async function useIdentity(context: BrowserContext, userId: string) {
  await context.addCookies([{ name: "teich_e2e_session", value: sessionToken(userId), url: baseUrl, httpOnly: true, sameSite: "Lax" }]);
}

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
  await page.getByRole("main").getByRole("link", { name: "New thread" }).click();
  await expect(page).toHaveURL(`/new?categoryId=${featureIds.category}`);
  await expect(page.getByLabel("Space")).toHaveValue(featureIds.category);
  await page.getByLabel("Title").fill("How should we test community discussions?");
  await page.getByLabel(/Tags/).fill("Testing, next js, testing");
  await page.locator('textarea[name="body"]').fill("A detailed browser-tested post for @pond_other.");
  await page.getByRole("button", { name: "Publish discussion" }).click();
  await expect(page).toHaveURL(/\/t\/how-should-we-test-community-discussions-/);
  createdThreadUrl = page.url();
  await expect(page.getByRole("heading", { name: "How should we test community discussions?" })).toBeVisible();
  await expect(page.getByRole("link", { name: "#testing" })).toBeVisible();
  await expect(page.getByRole("link", { name: "#next js" })).toBeVisible();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("button", { name: "Saved" })).toBeVisible();
});

test("another member replies, votes, follows, and starts a private conversation", async ({ context, page }) => {
  await useIdentity(context, featureIds.other);
  await page.goto(createdThreadUrl);
  await page.locator('textarea[name="body"]').fill("A thoughtful reply for @pond_member from the second member.");
  await page.getByRole("button", { name: "Post reply" }).click();
  await expect(page.getByText(/A thoughtful reply for @pond_member/)).toBeVisible();
  const threadVoteForm = page.locator('form:has(input[name="threadId"])').first();
  await threadVoteForm.getByRole("button").click();

  await page.goto(`/members/${featureIds.member}`);
  await page.getByRole("button", { name: "Follow" }).click();
  await expect(page.getByRole("button", { name: "Following" })).toBeVisible();
  await page.getByRole("button", { name: "Message" }).click();
  await expect(page).toHaveURL(/\/messages\//);
  await page.locator('textarea[name="body"]').fill("A private hello from Pond Other.");
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
  await expect(page.getByText("Please review this browser-generated report.")).toBeVisible();
  await page.getByRole("button", { name: "Hide reported content" }).click();
  await expect(page.getByText("Please review this browser-generated report.")).toBeVisible();
  await page.getByPlaceholder("Resolution note").fill("Reviewed in the feature journey");
  await page.getByRole("button", { name: "Resolve" }).click();
  await expect(page.getByText("No open reports.")).toBeVisible();

  await page.goto(createdThreadUrl);
  await expect(page.getByRole("heading", { name: "How should we test community discussions?" })).toBeVisible();
  await page.getByRole("button", { name: "Lock" }).click();
  await expect(page.getByText("This discussion is locked.")).toBeVisible();
});
