import { afterEach, expect, it, vi } from "vitest";
import nextConfig from "./next.config";

afterEach(() => vi.unstubAllEnvs());

it("adds one-year HSTS only in production and does not configure report-only CSP", async () => {
  vi.stubEnv("NODE_ENV", "production");
  const production = await nextConfig.headers!();
  const productionHeaders = production[0]!.headers;
  expect(productionHeaders).toContainEqual({ key: "Strict-Transport-Security", value: "max-age=31536000" });
  expect(productionHeaders.some((header) => header.key.includes("Content-Security-Policy"))).toBe(false);

  vi.stubEnv("NODE_ENV", "development");
  const development = await nextConfig.headers!();
  expect(development[0]!.headers.some((header) => header.key === "Strict-Transport-Security")).toBe(false);
});
