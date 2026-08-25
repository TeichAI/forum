import { defineConfig, devices } from "@playwright/test";

const e2ePort = process.env.STAFF_E2E_PORT ?? "3150";
const e2eBaseUrl = `http://localhost:${e2ePort}`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "staff.spec.ts",
  globalSetup: "./e2e/staff-global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  outputDir: "test-results/staff",
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report/staff" }]],
  use: {
    baseURL: e2eBaseUrl,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: `npm run dev -- --port ${e2ePort}`,
    url: e2eBaseUrl,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
