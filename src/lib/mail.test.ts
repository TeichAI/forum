import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const fn = () => vi.fn();
  return { participantMany: fn(), participantOne: fn(), draftCount: fn(), draftMany: fn(), draftFirst: fn() };
});
vi.mock("@/lib/db", () => ({ db: {
  mailParticipant: { findMany: mocks.participantMany, findUnique: mocks.participantOne },
  mailDraft: { count: mocks.draftCount, findMany: mocks.draftMany, findFirst: mocks.draftFirst },
} }));

import { getMailCounts, getMailDraft, getMailThread, isMailUnread, listMail, normalizeMailFolder } from "./mail";

const now = new Date("2026-08-25T12:00:00Z");

beforeEach(() => { vi.clearAllMocks(); mocks.draftCount.mockResolvedValue(0); mocks.participantMany.mockResolvedValue([]); });

describe("Mail queries", () => {
  it("normalizes folders and computes forced, never-read, stale, and current unread state", () => {
    expect(normalizeMailFolder("sent")).toBe("sent");
    expect(normalizeMailFolder("unknown")).toBe("inbox");
    expect(isMailUnread({ forcedUnread: true, lastReadAt: now, thread: { lastActivityAt: now } })).toBe(true);
    expect(isMailUnread({ forcedUnread: false, lastReadAt: null, thread: { lastActivityAt: now } })).toBe(true);
    expect(isMailUnread({ forcedUnread: false, lastReadAt: new Date(0), thread: { lastActivityAt: now } })).toBe(true);
    expect(isMailUnread({ forcedUnread: false, lastReadAt: now, thread: { lastActivityAt: now } })).toBe(false);
  });

  it("derives all folder and unread counts from participant state", async () => {
    mocks.draftCount.mockResolvedValue(2);
    mocks.participantMany.mockResolvedValue([
      { location: "INBOX", starred: true, lastReadAt: null, forcedUnread: false, thread: { lastActivityAt: now, entries: [{ id: "sent" }] } },
      { location: "ARCHIVE", starred: false, lastReadAt: now, forcedUnread: false, thread: { lastActivityAt: now, entries: [] } },
      { location: "TRASH", starred: true, lastReadAt: now, forcedUnread: false, thread: { lastActivityAt: now, entries: [{ id: "sent" }] } },
    ]);
    await expect(getMailCounts("user")).resolves.toEqual({ inbox: 1, unread: 1, starred: 1, sent: 1, drafts: 2, archive: 1, trash: 1 });
  });

  it("lists paged drafts and maps the cursor", async () => {
    mocks.draftMany.mockResolvedValue([{ id: "one" }, { id: "two" }, { id: "three" }]);
    await expect(listMail("user", { folder: "drafts", query: "pond", cursor: "older", take: 2 })).resolves.toEqual({ kind: "drafts", items: [{ id: "one" }, { id: "two" }], nextCursor: "two" });
    expect(mocks.draftMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ ownerId: "user", OR: expect.any(Array) }), cursor: { id: "older" }, skip: 1, take: 3 }));
  });

  it.each(["inbox", "starred", "sent", "archive", "trash"] as const)("lists and searches %s threads", async (folder) => {
    mocks.participantMany.mockResolvedValue([{ threadId: "one" }, { threadId: "two" }]);
    const result = await listMail("user", { folder, query: "water", take: 1 });
    expect(result).toEqual({ kind: "threads", items: [{ threadId: "one" }], nextCursor: "one" });
    expect(mocks.participantMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: "user", removedAt: null }), take: 2 }));
  });

  it("loads visible thread copies and owned drafts", async () => {
    mocks.participantOne.mockResolvedValueOnce({ removedAt: null, thread: {} }).mockResolvedValueOnce({ removedAt: now });
    await expect(getMailThread("user", "thread")).resolves.toEqual(expect.objectContaining({ thread: {} }));
    await expect(getMailThread("user", "removed")).resolves.toBeNull();
    mocks.draftFirst.mockResolvedValue({ id: "draft" });
    await expect(getMailDraft("user", "draft")).resolves.toEqual({ id: "draft" });
    expect(mocks.draftFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "draft", ownerId: "user" } }));
  });
});
