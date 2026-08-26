import { afterEach, beforeEach, expect, it, vi } from "vitest";

const cleanup = vi.hoisted(() => vi.fn());
vi.mock("@/lib/upload-cleanup", () => ({ cleanupUnclaimedUploads: cleanup }));
vi.mock("uploadthing/server", () => ({ UTApi: class MockUTApi {} }));

import { POST } from "./route";

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", "cron-test-secret");
  vi.stubEnv("UPLOADTHING_TOKEN", "upload-test-token");
  cleanup.mockResolvedValue({ removed: 2 });
});
afterEach(() => vi.unstubAllEnvs());

it("requires a bearer secret", async () => {
  await expect(POST(new Request("http://local", { method: "POST" }))).resolves.toHaveProperty("status", 401);
  expect(cleanup).not.toHaveBeenCalled();
});

it("runs cleanup for an authorized scheduler", async () => {
  const response = await POST(new Request("http://local", { method: "POST", headers: { authorization: "Bearer cron-test-secret" } }));
  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({ removed: 2 });
});

it("reports missing maintenance and upload configuration at their boundaries", async () => {
  vi.stubEnv("CRON_SECRET", "");
  await expect(POST(new Request("http://local", { method: "POST" }))).resolves.toHaveProperty("status", 503);
  vi.stubEnv("CRON_SECRET", "cron-test-secret");
  vi.stubEnv("UPLOADTHING_TOKEN", "");
  await expect(POST(new Request("http://local", { method: "POST", headers: { authorization: "Bearer cron-test-secret" } }))).resolves.toHaveProperty("status", 503);
  vi.stubEnv("UPLOADTHING_TOKEN", "upload-test-token");
  await expect(POST(new Request("http://local", { method: "POST", headers: { authorization: "Bearer xxxxxxxxxxxxxxxx" } }))).resolves.toHaveProperty("status", 401);
});
