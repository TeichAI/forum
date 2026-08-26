import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const fn = () => vi.fn();
  const db = {
    user: { findMany: fn() }, block: { findFirst: fn(), findMany: fn() },
    mailDraft: { findFirst: fn(), create: fn(), update: fn(), delete: fn(), deleteMany: fn() },
    mailParticipant: { findUnique: fn(), update: fn() }, mailThread: { create: fn(), update: fn() }, mailEntry: { create: fn() },
    attachment: { updateMany: fn() }, $transaction: fn(),
  };
  return { db, requireUser: fn(), consumeRateLimit: fn(), consumeUserMutation: fn(), claimAttachments: fn(), revalidatePath: fn(), redirect: fn() };
});
vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/attachments", () => ({ claimAttachments: mocks.claimAttachments }));
vi.mock("@/lib/rate-limit", async (original) => ({ ...(await original<typeof import("@/lib/rate-limit")>()), consumeRateLimit: mocks.consumeRateLimit, consumeUserMutation: mocks.consumeUserMutation }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import { deleteMailDraft, removeMailboxCopy, replyToMail, saveMailDraft, searchMailRecipients, sendMail, setMailLocation, setMailReadState, toggleMailStar } from "./mail";

const ids = { user: "cm000000000000000000000001", other: "cm000000000000000000000002", third: "cm000000000000000000000003", thread: "cm000000000000000000000004", entry: "cm000000000000000000000005", draft: "cm000000000000000000000006" };
const user = { id: ids.user, clerkId: "clerk-user", role: "MEMBER", status: "ACTIVE" };
const other = { id: ids.other, username: "other", displayName: "Other", imageUrl: null, role: "MEMBER", status: "ACTIVE" };

function form(values: Record<string, string | string[] | undefined>) {
  const data = new FormData();
  Object.entries(values).forEach(([key, value]) => Array.isArray(value) ? value.forEach((item) => data.append(key, item)) : value !== undefined && data.set(key, value));
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue(user);
  mocks.consumeRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0, resetAt: "now", remaining: 10 });
  mocks.consumeUserMutation.mockResolvedValue({ allowed: true, retryAfterSeconds: 0, resetAt: "now", remaining: 10 });
  mocks.db.user.findMany.mockResolvedValue([other]);
  mocks.db.block.findFirst.mockResolvedValue(null);
  mocks.db.block.findMany.mockResolvedValue([]);
  mocks.db.$transaction.mockImplementation(async (callback: (tx: typeof mocks.db) => unknown) => callback(mocks.db));
  mocks.redirect.mockImplementation((path: string) => { throw new Error(`redirect:${path}`); });
  mocks.db.mailThread.create.mockResolvedValue({ id: ids.thread, entries: [{ id: ids.entry }] });
});

describe("Mail server actions", () => {
  it("searches active recipients while handling short and limited searches", async () => {
    await expect(searchMailRecipients("x")).resolves.toEqual([]);
    mocks.consumeRateLimit.mockResolvedValueOnce({ allowed: false });
    await expect(searchMailRecipients("other")).resolves.toEqual([]);
    mocks.db.block.findMany.mockResolvedValue([{ blockerId: ids.user, blockedId: ids.third }]);
    await expect(searchMailRecipients("other")).resolves.toEqual([other]);
    expect(mocks.db.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: { notIn: expect.arrayContaining([ids.user, ids.third]) } }) }));
  });

  it("creates and updates drafts, claims images, and reports invalid or failed drafts", async () => {
    mocks.db.mailDraft.create.mockResolvedValue({ id: ids.draft, updatedAt: new Date("2026-01-01") });
    await expect(saveMailDraft(form({ recipientId: ids.other, subject: "Draft", body: "Body" }))).resolves.toEqual(expect.objectContaining({ status: "saved", draftId: ids.draft }));
    expect(mocks.claimAttachments).toHaveBeenCalledWith("Body", ids.user, "MAIL_DRAFT", ids.draft, ids.draft, mocks.db);

    mocks.db.mailDraft.findFirst.mockResolvedValue({ id: ids.draft });
    mocks.db.mailDraft.update.mockResolvedValue({ id: ids.draft, updatedAt: new Date("2026-01-02") });
    await expect(saveMailDraft(form({ draftId: ids.draft, recipientId: ids.other, subject: "Updated", body: "Body" }))).resolves.toEqual(expect.objectContaining({ status: "saved" }));
    expect(mocks.db.mailDraft.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ recipients: expect.objectContaining({ deleteMany: {} }) }) }));

    await expect(saveMailDraft(form({ draftId: "bad" }))).resolves.toEqual(expect.objectContaining({ status: "error" }));
    mocks.db.mailDraft.create.mockRejectedValueOnce(new Error("Database unavailable"));
    await expect(saveMailDraft(form({}))).resolves.toEqual({ status: "error", message: "Database unavailable" });
  });

  it("rejects unavailable draft recipients, threads, owners, and rate-limited saves", async () => {
    mocks.consumeUserMutation.mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 3, resetAt: "later", remaining: 0 });
    await expect(saveMailDraft(form({ subject: "Later" }))).resolves.toEqual(expect.objectContaining({ status: "rate_limited" }));

    mocks.db.user.findMany.mockResolvedValueOnce([]);
    await expect(saveMailDraft(form({ recipientId: ids.other }))).resolves.toEqual(expect.objectContaining({ status: "error", message: expect.stringContaining("unavailable") }));

    mocks.db.mailParticipant.findUnique.mockResolvedValueOnce({ removedAt: new Date() });
    await expect(saveMailDraft(form({ threadId: ids.thread }))).resolves.toEqual({ status: "error", message: "This mail thread is unavailable." });

    mocks.db.mailDraft.findFirst.mockResolvedValueOnce(null);
    await expect(saveMailDraft(form({ draftId: ids.draft }))).resolves.toEqual({ status: "error", message: "This draft is no longer available." });

    mocks.db.mailDraft.create.mockRejectedValueOnce("database failure");
    await expect(saveMailDraft(form({}))).resolves.toEqual({ status: "error", message: "We couldn’t save this draft." });
  });

  it("validates, sends, and fans out independent threads", async () => {
    await expect(sendMail(form({}))).resolves.toEqual(expect.objectContaining({ status: "error", fieldErrors: expect.any(Object) }));
    await expect(sendMail(form({ recipientId: ids.user, subject: "Subject", body: "Body" }))).resolves.toEqual(expect.objectContaining({ status: "error" }));
    await expect(sendMail(form({ recipientId: ids.other, subject: "Subject", body: "Body" }))).rejects.toThrow(`redirect:/mail/${ids.thread}`);
    expect(mocks.db.mailThread.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ participants: { create: expect.arrayContaining([expect.objectContaining({ userId: ids.user }), expect.objectContaining({ userId: ids.other })]) } }) }));

    mocks.requireUser.mockResolvedValue({ ...user, role: "MODERATOR" });
    mocks.db.user.findMany.mockResolvedValue([other, { ...other, id: ids.third }]);
    await expect(sendMail(form({ recipientId: [ids.other, ids.third], subject: "Staff subject", body: "Body" }))).rejects.toThrow("redirect:/mail?folder=sent");
    expect(mocks.db.mailThread.create).toHaveBeenCalledTimes(3);
  });

  it("returns rate limits and missing-draft errors before sending", async () => {
    mocks.consumeRateLimit.mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 4, resetAt: "later", remaining: 0 });
    await expect(sendMail(form({ recipientId: ids.other, subject: "Subject", body: "Body" }))).resolves.toEqual(expect.objectContaining({ status: "rate_limited" }));
    mocks.db.mailDraft.findFirst.mockResolvedValue(null);
    await expect(sendMail(form({ draftId: ids.draft, recipientId: ids.other, subject: "Subject", body: "Body" }))).resolves.toEqual(expect.objectContaining({ status: "error", message: expect.stringContaining("draft") }));
  });

  it("rejects unavailable, blocked, invalid fan-out, and non-error recipient failures", async () => {
    mocks.db.user.findMany.mockResolvedValueOnce([]);
    await expect(sendMail(form({ recipientId: ids.other, subject: "Subject", body: "Body" }))).resolves.toEqual(expect.objectContaining({ status: "error", message: expect.stringContaining("unavailable") }));

    mocks.db.block.findFirst.mockResolvedValueOnce({ blockerId: ids.other });
    await expect(sendMail(form({ recipientId: ids.other, subject: "Subject", body: "Body" }))).resolves.toEqual(expect.objectContaining({ status: "error", message: expect.stringContaining("unavailable") }));

    mocks.requireUser.mockResolvedValue({ ...user, role: "ADMIN" });
    await expect(sendMail(form({ subject: "Subject", body: "Body" }))).resolves.toEqual(expect.objectContaining({ status: "error", message: "Choose between 1 and 25 recipients." }));

    mocks.db.user.findMany.mockRejectedValueOnce("lookup failed");
    await expect(sendMail(form({ recipientId: ids.other, subject: "Subject", body: "Body" }))).resolves.toEqual(expect.objectContaining({ status: "error", message: "Choose valid recipients." }));
  });

  it("replies and returns an archived or removed recipient to inbox", async () => {
    mocks.db.mailParticipant.findUnique.mockResolvedValue({ removedAt: null, thread: { participants: [{ userId: ids.user, user }, { userId: ids.other, user: other }] } });
    mocks.db.mailEntry.create.mockResolvedValue({ id: ids.entry });
    await expect(replyToMail(form({ threadId: ids.thread, body: "A reply" }))).resolves.toEqual({ status: "success", message: "Reply sent." });
    expect(mocks.db.mailParticipant.update).toHaveBeenCalledWith(expect.objectContaining({ where: { threadId_userId: { threadId: ids.thread, userId: ids.other } }, data: expect.objectContaining({ location: "INBOX", removedAt: null }) }));
    mocks.db.block.findFirst.mockResolvedValue({ blockerId: ids.other });
    await expect(replyToMail(form({ threadId: ids.thread, body: "Blocked" }))).resolves.toEqual(expect.objectContaining({ status: "error" }));
  });

  it("rejects invalid, limited, removed, and inactive replies", async () => {
    await expect(replyToMail(form({ threadId: "bad", body: "Reply" }))).resolves.toEqual({ status: "error", message: "This mail thread is invalid." });
    mocks.consumeUserMutation.mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 3, resetAt: "later", remaining: 0 });
    await expect(replyToMail(form({ threadId: ids.thread, body: "Reply" }))).resolves.toEqual(expect.objectContaining({ status: "rate_limited" }));

    mocks.db.mailParticipant.findUnique.mockResolvedValueOnce(null);
    await expect(replyToMail(form({ threadId: ids.thread, body: "Reply" }))).resolves.toEqual({ status: "error", message: "This mail thread is unavailable." });

    mocks.db.mailParticipant.findUnique.mockResolvedValueOnce({ removedAt: null, thread: { participants: [{ userId: ids.user, user }] } });
    await expect(replyToMail(form({ threadId: ids.thread, body: "Reply" }))).resolves.toEqual({ status: "error", message: "The recipient is unavailable." });

    mocks.db.mailParticipant.findUnique.mockResolvedValueOnce({ removedAt: null, thread: { participants: [{ userId: ids.user, user }, { userId: ids.other, user: { ...other, status: "SUSPENDED" } }] } });
    await expect(replyToMail(form({ threadId: ids.thread, body: "Reply" }))).resolves.toEqual({ status: "error", message: "The recipient is unavailable." });
  });

  it("changes folders, stars, read state, and permanently removes trash", async () => {
    mocks.db.mailParticipant.findUnique.mockResolvedValue({ removedAt: null, location: "INBOX", starred: false });
    await expect(setMailLocation(form({ threadId: ids.thread, location: "ARCHIVE" }))).resolves.toEqual(expect.objectContaining({ message: "Mail archived." }));
    await toggleMailStar(form({ threadId: ids.thread }));
    expect(mocks.db.mailParticipant.update).toHaveBeenCalledWith(expect.objectContaining({ data: { starred: true } }));
    await setMailReadState(form({ threadId: ids.thread, unread: "true" }));
    expect(mocks.db.mailParticipant.update).toHaveBeenCalledWith(expect.objectContaining({ data: { forcedUnread: true, lastReadAt: undefined } }));
    await expect(removeMailboxCopy(form({ threadId: ids.thread }))).resolves.toEqual(expect.objectContaining({ status: "error", message: expect.stringContaining("Trash") }));
    mocks.db.mailParticipant.findUnique.mockResolvedValue({ removedAt: null, location: "TRASH", starred: false });
    await expect(removeMailboxCopy(form({ threadId: ids.thread }))).resolves.toEqual(expect.objectContaining({ status: "success" }));
    expect(mocks.db.mailParticipant.update).toHaveBeenCalledWith(expect.objectContaining({ data: { removedAt: expect.any(Date) } }));
  });

  it("covers restore, trash, read, unstar, invalid ownership, and mutation limits", async () => {
    mocks.db.mailParticipant.findUnique.mockResolvedValue({ removedAt: null, location: "INBOX", starred: true });
    await expect(setMailLocation(form({ threadId: ids.thread, location: "TRASH" }))).resolves.toEqual(expect.objectContaining({ message: "Mail moved to trash." }));
    await expect(setMailLocation(form({ threadId: ids.thread, location: "INBOX" }))).resolves.toEqual(expect.objectContaining({ message: "Mail restored to inbox." }));
    await toggleMailStar(form({ threadId: ids.thread }));
    expect(mocks.db.mailParticipant.update).toHaveBeenCalledWith(expect.objectContaining({ data: { starred: false } }));
    await setMailReadState(form({ threadId: ids.thread, unread: "false" }));
    expect(mocks.db.mailParticipant.update).toHaveBeenCalledWith(expect.objectContaining({ data: { forcedUnread: false, lastReadAt: expect.any(Date) } }));

    mocks.db.mailParticipant.findUnique.mockResolvedValueOnce({ removedAt: new Date(), location: "TRASH", starred: false });
    await expect(removeMailboxCopy(form({ threadId: ids.thread }))).resolves.toEqual({ status: "error", message: "This mail thread is unavailable." });

    mocks.consumeUserMutation.mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 3, resetAt: "later", remaining: 0 });
    await expect(setMailLocation(form({ threadId: ids.thread, location: "ARCHIVE" }))).resolves.toEqual(expect.objectContaining({ status: "rate_limited" }));
    await expect(toggleMailStar(form({ threadId: "bad" }))).resolves.toEqual({ status: "error", message: "This mail thread is unavailable." });
    await expect(setMailReadState(form({ threadId: "bad" }))).resolves.toEqual({ status: "error", message: "This mail thread is unavailable." });
  });

  it("deletes only owned drafts and releases their attachments", async () => {
    mocks.db.mailDraft.deleteMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 });
    await expect(deleteMailDraft(form({ draftId: ids.draft }))).resolves.toEqual(expect.objectContaining({ status: "error" }));
    await expect(deleteMailDraft(form({ draftId: ids.draft }))).resolves.toEqual(expect.objectContaining({ status: "success" }));
    expect(mocks.db.attachment.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { context: "DRAFT", targetId: null } }));
  });

  it("rejects invalid and rate-limited draft deletion", async () => {
    await expect(deleteMailDraft(form({ draftId: "bad" }))).resolves.toEqual({ status: "error", message: "Choose a valid draft." });
    mocks.consumeUserMutation.mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 3, resetAt: "later", remaining: 0 });
    await expect(deleteMailDraft(form({ draftId: ids.draft }))).resolves.toEqual(expect.objectContaining({ status: "rate_limited" }));
  });
});
