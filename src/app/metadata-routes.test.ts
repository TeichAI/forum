import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ categories: vi.fn(), tags: vi.fn(), users: vi.fn(), threads: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { category: { findMany: mocks.categories }, tag: { findMany: mocks.tags }, user: { findMany: mocks.users }, thread: { findMany: mocks.threads } } }));

import robots from "./robots";
import sitemap from "./sitemap";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.categories.mockResolvedValue([{ slug: "general", updatedAt: new Date("2026-08-01") }]);
  mocks.tags.mockResolvedValue([{ slug: "testing", createdAt: new Date("2026-08-02") }]);
  mocks.users.mockResolvedValue([{ id: "member", updatedAt: new Date("2026-08-03") }]);
  mocks.threads.mockResolvedValue([{ slug: "public-topic", updatedAt: new Date("2026-08-04") }]);
  vi.stubEnv("APP_ENV", "development");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
});

afterEach(() => vi.unstubAllEnvs());

describe("SEO metadata routes", () => {
  it("publishes the sitemap reference and protects private areas", () => {
    vi.stubEnv("APP_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://forum.example");
    expect(robots()).toEqual(expect.objectContaining({ sitemap: "https://forum.example/sitemap.xml", rules: expect.objectContaining({ allow: "/", disallow: expect.arrayContaining(["/mail", "/staff", "/search"]) }) }));
  });

  it("disallows all crawling and omits the sitemap in developer mode", () => {
    expect(robots()).toEqual({ rules: { userAgent: "*", disallow: "/" } });
  });

  it("includes only public canonical URL families and never queries or publishes members", async () => {
    const entries = await sitemap();
    expect(entries.map((entry) => entry.url)).toEqual(expect.arrayContaining(["http://localhost:3000/", "http://localhost:3000/terms", "http://localhost:3000/privacy", "http://localhost:3000/c/general", "http://localhost:3000/tag/testing", "http://localhost:3000/t/public-topic"]));
    expect(entries.map((entry) => entry.url).join(" ")).not.toMatch(/mail|staff|search|members|\?/);
    expect(mocks.users).not.toHaveBeenCalled();
  });
});
