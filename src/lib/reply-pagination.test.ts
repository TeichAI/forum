import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findFirst: vi.fn(), findMany: vi.fn(), queryRaw: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { reply: { findFirst: mocks.findFirst, findMany: mocks.findMany }, $queryRaw: mocks.queryRaw } }));

import { decodeCursor, encodeCursor } from "./queries";
import { listReplyBranches, REPLY_BRANCH_PAGE_SIZE } from "./reply-pagination";

const now = new Date("2026-08-25T12:00:00Z");

beforeEach(() => vi.clearAllMocks());

it("pages top-level branches with an opaque keyset cursor", async () => {
  const roots = Array.from({ length: 11 }, (_, index) => ({ id: `root-${index}`, createdAt: new Date(now.getTime() + index) }));
  mocks.findMany.mockResolvedValueOnce(roots).mockResolvedValueOnce(roots.slice(0, 10));
  mocks.queryRaw.mockImplementation(async () => [{ id: "reply" }]);

  const page = await listReplyBranches({ threadId: "thread" });

  expect(page.items).toEqual(roots.slice(0, 10));
  expect(decodeCursor<{ id: string }>(page.nextCursor ?? "")?.id).toBe("root-9");
  expect(mocks.queryRaw).toHaveBeenCalledTimes(10);
});

it("applies a valid root cursor and safely ignores malformed cursor dates", async () => {
  mocks.findMany.mockResolvedValue([]);
  const createdAt = new Date("2026-08-25T11:00:00Z");

  await listReplyBranches({ threadId: "thread", cursor: encodeCursor({ createdAt: createdAt.toISOString(), id: "root" }) });
  expect(mocks.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
    where: expect.objectContaining({
      AND: { OR: [{ createdAt: { gt: createdAt } }, { createdAt, id: { gt: "root" } }] },
    }),
  }));

  await listReplyBranches({ threadId: "thread", cursor: encodeCursor({ createdAt: "not-a-date", id: "root" }) });
  expect(mocks.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: expect.objectContaining({ AND: undefined }) }));
});

it("caps a selected branch and exposes its next continuation page", async () => {
  mocks.findFirst.mockResolvedValue({ id: "root", createdAt: now });
  mocks.queryRaw.mockResolvedValue(Array.from({ length: REPLY_BRANCH_PAGE_SIZE + 1 }, (_, index) => ({ id: `reply-${index}` })));
  mocks.findMany.mockResolvedValue([{ id: "reply-0", createdAt: now }]);

  const page = await listReplyBranches({ threadId: "thread", branchId: "root", branchPage: 2, viewerId: "viewer" });

  expect(page.continuations).toEqual([{ rootId: "root", page: 3 }]);
  expect(page.selectedBranchId).toBe("root");
  expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
    include: expect.objectContaining({ upvotes: { where: { userId: "viewer" } }, dislikes: { where: { userId: "viewer" } } }),
  }));
});

it("bounds invalid and excessive branch page numbers", async () => {
  mocks.findFirst.mockResolvedValue({ id: "root", createdAt: now });
  mocks.queryRaw.mockResolvedValue(Array.from({ length: REPLY_BRANCH_PAGE_SIZE + 1 }, (_, index) => ({ id: `reply-${index}` })));
  mocks.findMany.mockResolvedValue([]);

  await expect(listReplyBranches({ threadId: "thread", branchId: "root", branchPage: Infinity })).resolves.toMatchObject({
    continuations: [{ rootId: "root", page: 1 }],
  });
  await expect(listReplyBranches({ threadId: "thread", branchId: "root", branchPage: 10_000 })).resolves.toMatchObject({
    continuations: [{ rootId: "root", page: 101 }],
  });
  await expect(listReplyBranches({ threadId: "thread", branchId: "root", branchPage: -5 })).resolves.toMatchObject({
    continuations: [{ rootId: "root", page: 1 }],
  });
});

it("returns an empty branch page when the requested root is inaccessible", async () => {
  mocks.findFirst.mockResolvedValue(null);
  await expect(listReplyBranches({ threadId: "thread", branchId: "missing" })).resolves.toEqual({
    items: [], nextCursor: null, continuations: [], selectedBranchId: "missing",
  });
  expect(mocks.queryRaw).not.toHaveBeenCalled();
});

it("filters non-published replies for regular users", async () => {
  mocks.findMany.mockResolvedValueOnce([{ id: "root-1", createdAt: now }]).mockResolvedValueOnce([]);
  mocks.queryRaw.mockResolvedValue([{ id: "reply-1" }]);

  await listReplyBranches({ threadId: "thread", viewerIsStaff: false });

  expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: expect.objectContaining({ status: "PUBLISHED" }),
  }));
});

it("skips status filter for staff viewers", async () => {
  mocks.findMany.mockResolvedValueOnce([{ id: "root-1", createdAt: now }]).mockResolvedValueOnce([]);
  mocks.queryRaw.mockResolvedValue([{ id: "reply-1" }]);

  await listReplyBranches({ threadId: "thread", viewerIsStaff: true });

  const rootQuery = mocks.findMany.mock.calls[0][0];
  expect(rootQuery.where).not.toHaveProperty("status");
});

it("applies status filter to branch root lookup for non-staff", async () => {
  mocks.findFirst.mockResolvedValue(null);

  await listReplyBranches({ threadId: "thread", branchId: "root", viewerIsStaff: false });

  expect(mocks.findFirst).toHaveBeenCalledWith(expect.objectContaining({
    where: expect.objectContaining({ status: "PUBLISHED" }),
  }));
});

it("omits status filter from branch root lookup for staff", async () => {
  mocks.findFirst.mockResolvedValue(null);

  await listReplyBranches({ threadId: "thread", branchId: "root", viewerIsStaff: true });

  const query = mocks.findFirst.mock.calls[0][0];
  expect(query.where).not.toHaveProperty("status");
});
