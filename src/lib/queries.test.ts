import { beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.hoisted(() => vi.fn());
const findUsers = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({ db: { thread: { findMany }, user: { findMany: findUsers } } }));

import { canModerate, decodeCursor, encodeCursor, listMembersPage, listThreads, listThreadsPage, memberListSelect, searchThreads, threadListInclude } from "./queries";

beforeEach(() => {
  findMany.mockReset().mockResolvedValue([]);
  findUsers.mockReset().mockResolvedValue([]);
});

describe("thread queries", () => {
  it.each([
    [undefined, [{ isPinned: "desc" }, { bumpedAt: "desc" }, { id: "desc" }]],
    ["recent", [{ isPinned: "desc" }, { bumpedAt: "desc" }, { id: "desc" }]],
    ["new", [{ isPinned: "desc" }, { createdAt: "desc" }, { id: "desc" }]],
    ["top", [{ isPinned: "desc" }, { upvotes: { _count: "desc" } }, { bumpedAt: "desc" }, { id: "desc" }]],
  ] as const)("builds the %s thread ordering", async (sort, orderBy) => {
    await listThreads({ sort, categoryId: "category", tagId: "tag", authorId: "author", take: 12 });
    expect(findMany).toHaveBeenCalledWith({
      where: { status: "PUBLISHED", category: { archivedAt: null }, author: { status: "ACTIVE" }, categoryId: "category", authorId: "author", tags: { some: { tagId: "tag" } }, AND: undefined },
      include: threadListInclude,
      orderBy,
      take: 13,
    });
  });

  it("uses safe defaults and omits the tag relation filter", async () => {
    await listThreads();
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: "PUBLISHED", category: { archivedAt: null }, author: { status: "ACTIVE" }, categoryId: undefined, authorId: undefined, tags: undefined, AND: undefined }, take: 31,
    }));
  });

  it("returns early for blank search and searches all supported fields", async () => {
    await expect(searchThreads("   ")).resolves.toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
    await searchThreads(`  ${"x".repeat(120)}  `);
    const call = findMany.mock.calls[0][0];
    expect(call.where.status).toBe("PUBLISHED");
    expect(call.where.AND[1].OR).toHaveLength(5);
    expect(call.where.AND[1].OR[0].title.contains).toHaveLength(100);
    expect(call.where.AND[1].OR[2].replies.some.author).toEqual({ status: "ACTIVE" });
    expect(call.take).toBe(51);
  });

  it("emits a stable keyset cursor and does not rely on the previous row remaining", async () => {
    const bumpedAt = new Date("2026-08-25T12:00:00Z");
    findMany.mockResolvedValue([
      { id: "c", isPinned: false, bumpedAt, createdAt: bumpedAt },
      { id: "b", isPinned: false, bumpedAt, createdAt: bumpedAt },
    ]);
    const page = await listThreadsPage({ take: 1 });
    expect(page.items).toHaveLength(1);
    expect(decodeCursor<{ id: string }>(page.nextCursor ?? "")?.id).toBe("c");

    findMany.mockResolvedValue([]);
    await listThreadsPage({ take: 1, cursor: page.nextCursor ?? undefined });
    expect(findMany.mock.calls[1][0].where.AND).toEqual({
      isPinned: false,
      OR: [{ bumpedAt: { lt: bumpedAt } }, { bumpedAt, id: { lt: "c" } }],
    });
  });

  it("applies pinned and new-thread cursors and rejects incompatible cursors", async () => {
    const time = new Date("2026-08-25T12:00:00Z");
    const recentCursor = encodeCursor({ sort: "recent", pinned: true, time: time.toISOString(), id: "thread" });
    await listThreadsPage({ cursor: recentCursor });
    expect(findMany.mock.calls[0][0].where.AND).toEqual({
      OR: [
        { isPinned: true, OR: [{ bumpedAt: { lt: time } }, { bumpedAt: time, id: { lt: "thread" } }] },
        { isPinned: false },
      ],
    });

    const newCursor = encodeCursor({ sort: "new", pinned: false, time: time.toISOString(), id: "thread" });
    await listThreadsPage({ sort: "new", cursor: newCursor });
    expect(findMany.mock.calls[1][0].where.AND).toEqual({
      isPinned: false,
      OR: [{ createdAt: { lt: time } }, { createdAt: time, id: { lt: "thread" } }],
    });

    await listThreadsPage({ sort: "top", cursor: encodeCursor({ sort: "top", pinned: false, time: time.toISOString(), id: "thread" }) });
    await listThreadsPage({ cursor: encodeCursor({ sort: "new", pinned: false, time: "invalid", id: "" }) });
    expect(findMany.mock.calls[2][0].where.AND).toBeUndefined();
    expect(findMany.mock.calls[3][0].where.AND).toBeUndefined();
  });

  it("returns null for empty, scalar, and malformed cursors", () => {
    expect(decodeCursor(undefined)).toBeNull();
    expect(decodeCursor(encodeCursor("value" as unknown as object))).toBeNull();
    expect(decodeCursor("not-json")).toBeNull();
  });
});

describe("member queries", () => {
  it("lists only active members and searches public profile fields", async () => {
    await listMembersPage(`  ${"x".repeat(100)}  `, undefined, 12, "MODERATOR");
    const call = findUsers.mock.calls[0][0];
    expect(call.where.status).toBe("ACTIVE");
    expect(call.where.role).toBe("MODERATOR");
    expect(call.where.AND[0].OR).toEqual([
      { displayName: { contains: "x".repeat(80), mode: "insensitive" } },
      { username: { contains: "x".repeat(80), mode: "insensitive" } },
    ]);
    expect(call.where.AND[1]).toEqual({});
    expect(call.select).toBe(memberListSelect);
    expect(call.orderBy).toEqual([{ displayName: "asc" }, { id: "asc" }]);
    expect(call.take).toBe(13);
  });

  it("returns a stable alphabetical cursor and applies it to the next page", async () => {
    findUsers.mockResolvedValue([
      { id: "ada", displayName: "Ada" },
      { id: "grace", displayName: "Grace" },
    ]);
    const page = await listMembersPage("", undefined, 1);
    expect(page.items).toEqual([{ id: "ada", displayName: "Ada" }]);
    expect(decodeCursor<{ displayName: string; id: string }>(page.nextCursor ?? "")).toEqual({ displayName: "Ada", id: "ada" });

    findUsers.mockResolvedValue([]);
    await listMembersPage("", page.nextCursor ?? undefined, 1);
    expect(findUsers.mock.calls[1][0].where.AND[1]).toEqual({
      OR: [
        { displayName: { gt: "Ada" } },
        { displayName: "Ada", id: { gt: "ada" } },
      ],
    });
  });

  it("ignores malformed cursors and clamps page size", async () => {
    await listMembersPage("", encodeCursor({ displayName: "", id: "missing" }), 100);
    expect(findUsers.mock.calls[0][0].where.AND).toEqual([{}, {}]);
    expect(findUsers.mock.calls[0][0].take).toBe(51);
  });
});

it.each([
  [null, false], [{ role: "MEMBER" }, false], [{ role: "MODERATOR" }, true], [{ role: "ADMIN" }, true],
])("calculates moderation permission for %j", (user, expected) => {
  expect(canModerate(user as never)).toBe(expected);
});
