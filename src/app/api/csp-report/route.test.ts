import { afterEach, expect, it, vi } from "vitest";
import { POST } from "./route";

afterEach(() => vi.restoreAllMocks());

it("accepts a report while logging only sanitized fields", async () => {
  const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const response = await POST(new Request("http://local/api/csp-report", { method: "POST", body: JSON.stringify({ "csp-report": { "effective-directive": "script-src", "blocked-uri": "https://secret.example/path?token=x" } }) }));
  expect(response.status).toBe(204);
  expect(warning).toHaveBeenCalledWith("CSP violation", { directive: "script-src", disposition: "report" });
});

it("rejects invalid and oversized reports", async () => {
  await expect(POST(new Request("http://local", { method: "POST", body: "{" }))).resolves.toHaveProperty("status", 400);
  await expect(POST(new Request("http://local", { method: "POST", headers: { "content-length": "20000" }, body: "{}" }))).resolves.toHaveProperty("status", 413);
  await expect(POST(new Request("http://local", { method: "POST", body: JSON.stringify({ body: { effectiveDirective: "x".repeat(100) } }).padEnd(17_000, " ") }))).resolves.toHaveProperty("status", 413);
});

it("accepts modern report bodies and normalizes unsafe values", async () => {
  const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const response = await POST(new Request("http://local", { method: "POST", body: JSON.stringify({ body: { effectiveDirective: "<unsafe>", disposition: "enforce" } }) }));
  expect(response.status).toBe(204);
  expect(warning).toHaveBeenCalledWith("CSP violation", { directive: "unknown", disposition: "enforce" });
});
