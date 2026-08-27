import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const fn = () => vi.fn();
  return { participantMany: fn(), staffMany: fn(), draftCount: fn(), draftMany: fn(), draftFirst: fn(), threadOne: fn(), queryRaw: fn(), access: fn(), staff: fn() };
});
vi.mock("@/lib/db", () => ({ db: {
  $queryRaw: mocks.queryRaw,
  mailParticipant: { findMany: mocks.participantMany },
  staffMailboxThread: { findMany: mocks.staffMany },
  mailThread: { findUnique: mocks.threadOne },
  mailDraft: { count: mocks.draftCount, findMany: mocks.draftMany, findFirst: mocks.draftFirst },
} }));
vi.mock("@/lib/mail-access", () => ({ getMailThreadAccess: mocks.access, isCurrentMailStaff: mocks.staff }));

import { getMailCounts, getMailDraft, getMailThread, getStaffMailCounts, isMailUnread, listMail, listStaffMail, normalizeMailFolder, normalizeStaffMailFolder } from "./mail";
import { decodeCursor, encodeCursor } from "./queries";

const now = new Date("2026-08-25T12:00:00Z");

beforeEach(() => { vi.clearAllMocks(); mocks.draftCount.mockResolvedValue(0); mocks.participantMany.mockResolvedValue([]); mocks.staffMany.mockResolvedValue([]); mocks.queryRaw.mockResolvedValue([]); mocks.staff.mockResolvedValue(true); });

describe("Mail queries", () => {
  it("normalizes folders and computes forced, never-read, stale, and current unread state", () => {
    expect(normalizeMailFolder("sent")).toBe("sent");
    expect(normalizeMailFolder("unknown")).toBe("inbox");
    expect(normalizeMailFolder("staff")).toBe("staff");
    expect(normalizeStaffMailFolder("trash")).toBe("trash");
    expect(normalizeStaffMailFolder("sent")).toBe("inbox");
    expect(isMailUnread({ forcedUnread: true, lastReadAt: now, thread: { lastActivityAt: now } })).toBe(true);
    expect(isMailUnread({ forcedUnread: false, lastReadAt: null, thread: { lastActivityAt: now } })).toBe(true);
    expect(isMailUnread({ forcedUnread: false, lastReadAt: new Date(0), thread: { lastActivityAt: now } })).toBe(true);
    expect(isMailUnread({ forcedUnread: false, lastReadAt: now, thread: { lastActivityAt: now } })).toBe(false);
  });

  it("derives and lists shared staff folders with explicit access context", async () => {
    const viewer = { id: "staff", clerkId: "clerk-staff", role: "MODERATOR" as const };
    mocks.queryRaw.mockResolvedValue([{ inbox: BigInt(2), unread: BigInt(1), starred: BigInt(1), archive: BigInt(3), trash: BigInt(4) }]);
    await expect(getStaffMailCounts(viewer)).resolves.toEqual({ inbox: 2, unread: 1, starred: 1, archive: 3, trash: 4 });

    mocks.staffMany.mockResolvedValue([
      { threadId: "one", thread: { lastActivityAt: now } },
      { threadId: "two", thread: { lastActivityAt: now } },
    ]);
    const result = await listStaffMail(viewer, { folder: "starred", query: "pond", take: 1 });
    expect(result.items).toEqual([expect.objectContaining({ threadId: "one", accessContext: "staff" })]);
    expect(mocks.staffMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ removedAt: null, starred: true, location: { not: "TRASH" }, thread: expect.any(Object) }),
      take: 2,
    }));

    mocks.staff.mockResolvedValue(false);
    await expect(listStaffMail(viewer)).resolves.toEqual({ kind: "threads", items: [], nextCursor: null });
  });

  it("derives all folder and unread counts from participant state", async () => {
    mocks.draftCount.mockResolvedValue(2);
    mocks.queryRaw.mockResolvedValue([{ inbox: BigInt(1), unread: BigInt(1), starred: BigInt(1), sent: BigInt(1), archive: BigInt(1), trash: BigInt(1) }]);
    await expect(getMailCounts("user")).resolves.toEqual({ inbox: 1, unread: 1, starred: 1, sent: 1, drafts: 2, archive: 1, trash: 1 });
    expect(mocks.participantMany).not.toHaveBeenCalled();
  });

  it("lists paged drafts and maps the cursor", async () => {
    const older = new Date("2026-08-24T12:00:00Z");
    mocks.draftMany.mockResolvedValue([{ id: "one", updatedAt: now }, { id: "two", updatedAt: now }, { id: "three", updatedAt: older }]);
    const cursor = encodeCursor({ updatedAt: older.toISOString(), id: "old-deleted-row" });
    const result = await listMail("user", { folder: "drafts", query: "pond", cursor, take: 2 });
    expect(result.items).toEqual([expect.objectContaining({ id: "one", updatedAt: now, accessContext: "personal" }), expect.objectContaining({ id: "two", updatedAt: now, accessContext: "personal" })]);
    expect(decodeCursor<{ id: string }>(result.nextCursor ?? "")?.id).toBe("two");
    expect(mocks.draftMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ ownerId: "user", OR: expect.any(Array), AND: expect.any(Object) }),
      take: 3,
    }));
  });

  it.each(["inbox", "starred", "sent", "archive", "trash"] as const)("lists and searches %s threads", async (folder) => {
    mocks.participantMany.mockResolvedValue([{ threadId: "one", thread: { lastActivityAt: now } }, { threadId: "two", thread: { lastActivityAt: now } }]);
    const result = await listMail("user", { folder, query: "water", take: 1 });
    expect(result.kind).toBe("threads");
    expect(result.items).toEqual([expect.objectContaining({ threadId: "one", accessContext: "personal", thread: { lastActivityAt: now } })]);
    expect(decodeCursor<{ id: string }>(result.nextCursor ?? "")?.id).toBe("one");
    expect(mocks.participantMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: "user", removedAt: null }), take: 2 }));
  });

  it("loads visible thread copies and owned drafts", async () => {
    const viewer = { id: "user", clerkId: "clerk-user", role: "MEMBER" as const };
    mocks.access.mockResolvedValueOnce({ kind: "personal", state: { threadId: "thread", userId: "user", removedAt: null } }).mockResolvedValueOnce(null);
    mocks.threadOne.mockResolvedValue({ id: "thread", staffMailbox: null, participants: [], entries: [] });
    await expect(getMailThread(viewer, "thread")).resolves.toEqual(expect.objectContaining({ thread: expect.objectContaining({ id: "thread" }) }));
    await expect(getMailThread(viewer, "removed")).resolves.toBeNull();
    mocks.draftFirst.mockResolvedValue({ id: "draft" });
    await expect(getMailDraft("user", "draft")).resolves.toEqual({ id: "draft" });
    expect(mocks.draftFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "draft", ownerId: "user" } }));
  });
});
