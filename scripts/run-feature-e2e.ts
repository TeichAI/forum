import { runWithTestDatabase } from "./test-database";

runWithTestDatabase("npx", ["playwright", "test", "--config", "playwright.config.ts"], {
  E2E_TEST_MODE: "1",
  E2E_AUTH_SECRET: process.env.E2E_AUTH_SECRET ?? "local-e2e-secret-with-at-least-32-characters",
});
