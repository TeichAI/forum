import { beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({ db: { thread: { findMany } } }));

import { canModerate, listThreads, searchThreads, threadListInclude } from "./queries";

beforeEach(() => findMany.mockReset().mockResolvedValue([]));

describe("thread queries", () => {
  it.each([
    [undefined, [{ isPinned: "desc" }, { bumpedAt: "desc" }]],
    ["recent", [{ isPinned: "desc" }, { bumpedAt: "desc" }]],
    ["new", [{ isPinned: "desc" }, { createdAt: "desc" }]],
    ["top", [{ isPinned: "desc" }, { votes: { _count: "desc" } }, { bumpedAt: "desc" }]],
  ] as const)("builds the %s thread ordering", async (sort, orderBy) => {
    await listThreads({ sort, categoryId: "category", tagId: "tag", authorId: "author", take: 12 });
    expect(findMany).toHaveBeenCalledWith({
      where: { status: "PUBLISHED", category: { archivedAt: null }, categoryId: "category", authorId: "author", tags: { some: { tagId: "tag" } } },
      include: threadListInclude,
      orderBy,
      take: 12,
    });
  });

  it("uses safe defaults and omits the tag relation filter", async () => {
    await listThreads();
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: "PUBLISHED", category: { archivedAt: null }, categoryId: undefined, authorId: undefined, tags: undefined }, take: 30,
    }));
  });

  it("returns early for blank search and searches all supported fields", async () => {
    await expect(searchThreads("   ")).resolves.toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
    await searchThreads(`  ${"x".repeat(120)}  `);
    const call = findMany.mock.calls[0][0];
    expect(call.where.status).toBe("PUBLISHED");
    expect(call.where.OR).toHaveLength(5);
    expect(call.where.OR[0].title.contains).toHaveLength(100);
    expect(call.take).toBe(50);
  });
});

it.each([
  [null, false], [{ role: "MEMBER" }, false], [{ role: "MODERATOR" }, true], [{ role: "ADMIN" }, true],
])("calculates moderation permission for %j", (user, expected) => {
  expect(canModerate(user as never)).toBe(expected);
});
