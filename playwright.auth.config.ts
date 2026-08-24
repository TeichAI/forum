import { defineConfig, devices } from "@playwright/test";

const e2ePort = process.env.E2E_AUTH_PORT ?? "3200";
const e2eBaseUrl = `http://localhost:${e2ePort}`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "auth.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  globalSetup: "./e2e/global-setup.ts",
  outputDir: "test-results/auth",
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report/auth" }]],
  use: {
    baseURL: e2eBaseUrl,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: `npm run dev -- --port ${e2ePort}`,
    url: `${e2eBaseUrl}/sign-in`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
