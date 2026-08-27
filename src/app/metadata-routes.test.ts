import { beforeEach, describe, expect, it, vi } from "vitest";

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
});

describe("SEO metadata routes", () => {
  it("publishes the sitemap reference and protects private areas", () => {
    expect(robots()).toEqual(expect.objectContaining({ sitemap: "http://localhost:3000/sitemap.xml", rules: expect.objectContaining({ allow: "/", disallow: expect.arrayContaining(["/mail", "/staff", "/search"]) }) }));
  });

  it("includes only the public canonical URL families", async () => {
    const entries = await sitemap();
    expect(entries.map((entry) => entry.url)).toEqual(expect.arrayContaining(["http://localhost:3000/", "http://localhost:3000/terms", "http://localhost:3000/privacy", "http://localhost:3000/c/general", "http://localhost:3000/tag/testing", "http://localhost:3000/members/member", "http://localhost:3000/t/public-topic"]));
    expect(entries.map((entry) => entry.url).join(" ")).not.toMatch(/mail|staff|search|\?/);
  });
});
