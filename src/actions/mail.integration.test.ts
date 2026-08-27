import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@prisma/client";

const state = vi.hoisted(() => ({ user: null as User | null, uploads: false }));
vi.mock("@/lib/auth", () => ({
  requireUser: vi.fn(async () => state.user),
  getVerifiedUserRole: vi.fn(async (user: User) => user.role),
}));
vi.mock("@/lib/upload-capability", () => ({ uploadsEnabled: vi.fn(() => state.uploads) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn((path: string) => { throw new Error(`redirect:${path}`); }) }));

import {
  deleteMailDraft,
  removeMailboxCopy,
  replyToMail,
  saveMailDraft,
  searchMailRecipients,
  sendMail,
  setMailLocation,
  setMailReadState,
  toggleMailStar,
} from "./mail";
import { blockMember, reportContent } from "./forum";
import { db } from "@/lib/db";
import { getMailCounts, getStaffMailCounts, listMail, listStaffMail } from "@/lib/mail";
import { canAccessMailEntry } from "@/lib/mail-access";
import { canAccessPrivateAttachment } from "@/lib/attachment-access";
import { createTestUser } from "@/test/integration-factories";

function form(values: Record<string, string | string[] | undefined>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    if (Array.isArray(value)) value.forEach((item) => data.append(key, item));
    else if (value !== undefined) data.set(key, value);
  }
  return data;
}

beforeEach(() => { state.user = null; state.uploads = false; });

describe("Mail actions against PostgreSQL", () => {
  it("sends one-to-one Mail with unread counts, search, and participation-scoped reports", async () => {
    const [sender, recipient, outsider] = await Promise.all([
      createTestUser({ displayName: "Pond Sender", username: "pond_sender" }),
      createTestUser({ displayName: "Pond Recipient", username: "pond_recipient" }),
      createTestUser({ displayName: "Outsider", username: "outsider" }),
    ]);
    state.user = sender;
    await expect(searchMailRecipients("recipient")).resolves.toEqual([expect.objectContaining({ id: recipient.id })]);
    await expect(sendMail(form({ recipientId: recipient.id, subject: "Water quality", body: "Could we compare notes?" }))).rejects.toThrow("redirect:/mail/");
    const thread = await db.mailThread.findFirstOrThrow({ include: { participants: true, entries: true } });
    expect(thread.participants.map((item) => item.userId).sort()).toEqual([recipient.id, sender.id].sort());
    expect(thread.entries).toHaveLength(1);
    expect(await getMailCounts(recipient.id)).toEqual(expect.objectContaining({ inbox: 1, unread: 1 }));
    expect(await getMailCounts(sender.id)).toEqual(expect.objectContaining({ sent: 1, unread: 0 }));
    expect((await listMail(recipient.id, { query: "quality" })).items).toHaveLength(1);

    state.user = outsider;
    await expect(reportContent(form({ targetType: "MAIL_ENTRY", targetId: thread.entries[0]!.id, reason: "Spam" }))).rejects.toThrow("not visible");
    state.user = recipient;
    await reportContent(form({ targetType: "MAIL_ENTRY", targetId: thread.entries[0]!.id, reason: "Spam" }));
    expect(await db.report.findFirst()).toEqual(expect.objectContaining({ targetType: "MAIL_ENTRY", targetId: thread.entries[0]!.id }));
  });

  it("creates isolated staff BCC threads atomically and enforces the 25-recipient cap", async () => {
    const staff = await createTestUser({ role: "MODERATOR" });
    const recipients = await Promise.all([createTestUser(), createTestUser(), createTestUser()]);
    state.user = staff;
    await expect(sendMail(form({ recipientId: recipients.map((item) => item.id), subject: "Staff update", body: "Private copy" }))).rejects.toThrow("redirect:/mail?folder=sent");
    const threads = await db.mailThread.findMany({ include: { participants: true } });
    expect(threads).toHaveLength(3);
    for (const thread of threads) {
      expect(thread.participants).toHaveLength(2);
      expect(thread.participants.some((item) => item.userId === staff.id)).toBe(true);
      expect(thread.participants.filter((item) => item.userId !== staff.id)).toHaveLength(1);
    }

    const tooMany = await Promise.all(Array.from({ length: 26 }, () => createTestUser()));
    await expect(sendMail(form({ recipientId: tooMany.map((item) => item.id), subject: "Too broad", body: "No send" }))).resolves.toEqual(expect.objectContaining({ status: "error", message: expect.stringContaining("25") }));
    expect(await db.mailThread.count()).toBe(3);
  });

  it("autosaves and deletes owned drafts while claiming referenced inline images", async () => {
    const [sender, recipient] = await Promise.all([createTestUser(), createTestUser()]);
    state.user = sender;
    state.uploads = true;
    const attachment = await db.attachment.create({ data: { key: "mail-image", url: "https://utfs.io/f/mail-image", name: "pond.png", size: 42, access: "PRIVATE", userId: sender.id } });
    const saved = await saveMailDraft(form({ recipientId: recipient.id, subject: "Draft subject", body: `Inline ![pond](/api/attachments/${attachment.id})` }));
    expect(saved).toEqual(expect.objectContaining({ status: "saved", draftId: expect.any(String) }));
    expect(await db.attachment.findUniqueOrThrow({ where: { id: attachment.id } })).toEqual(expect.objectContaining({ context: "MAIL_DRAFT", targetId: saved.status === "saved" ? saved.draftId : undefined }));
    expect(await getMailCounts(sender.id)).toEqual(expect.objectContaining({ drafts: 1 }));
    await deleteMailDraft(form({ draftId: saved.status === "saved" ? saved.draftId! : "" }));
    expect(await db.mailDraft.count()).toBe(0);
    expect(await db.attachment.findUniqueOrThrow({ where: { id: attachment.id } })).toEqual(expect.objectContaining({ context: "DRAFT", targetId: null }));
  });

  it("enforces blocking and restores archived, trashed, and removed copies on a later reply", async () => {
    const [one, two] = await Promise.all([createTestUser(), createTestUser()]);
    state.user = one;
    await expect(sendMail(form({ recipientId: two.id, subject: "Restoration", body: "First entry" }))).rejects.toThrow("redirect:/mail/");
    const thread = await db.mailThread.findFirstOrThrow();

    state.user = two;
    await setMailLocation(form({ threadId: thread.id, location: "ARCHIVE" }));
    state.user = one;
    await replyToMail(form({ threadId: thread.id, body: "Archive comes back" }));
    expect(await db.mailParticipant.findUniqueOrThrow({ where: { threadId_userId: { threadId: thread.id, userId: two.id } } })).toEqual(expect.objectContaining({ location: "INBOX", removedAt: null }));

    state.user = two;
    await setMailLocation(form({ threadId: thread.id, location: "TRASH" }));
    await removeMailboxCopy(form({ threadId: thread.id }));
    expect(await listMail(two.id)).toEqual(expect.objectContaining({ items: [] }));
    state.user = one;
    await replyToMail(form({ threadId: thread.id, body: "Removed copy returns" }));
    expect(await db.mailParticipant.findUniqueOrThrow({ where: { threadId_userId: { threadId: thread.id, userId: two.id } } })).toEqual(expect.objectContaining({ location: "INBOX", removedAt: null }));
    expect(await db.mailEntry.count({ where: { threadId: thread.id } })).toBe(3);

    state.user = two;
    await blockMember(form({ userId: one.id }));
    await expect(replyToMail(form({ threadId: thread.id, body: "Blocked" }))).resolves.toEqual(expect.objectContaining({ status: "error", message: expect.stringContaining("unavailable") }));
    state.user = one;
    await expect(sendMail(form({ recipientId: two.id, subject: "Blocked new mail", body: "No delivery" }))).resolves.toEqual(expect.objectContaining({ status: "error", message: expect.stringContaining("unavailable") }));
  });

  it("rolls back fan-out and preserves the draft when attachment claiming fails", async () => {
    const [sender, first, second] = await Promise.all([createTestUser({ role: "MODERATOR" }), createTestUser(), createTestUser()]);
    state.user = sender;
    state.uploads = true;
    const attachment = await db.attachment.create({ data: { key: "mail-rollback", url: "https://utfs.io/f/mail-rollback", name: "mail.png", size: 42, access: "PRIVATE", userId: sender.id } });
    const body = `Inline ![pond](/api/attachments/${attachment.id})`;
    const saved = await saveMailDraft(form({ recipientId: [first.id, second.id], subject: "Atomic Mail", body }));
    if (saved.status !== "saved") throw new Error("Expected a saved draft");
    await db.$executeRawUnsafe(`CREATE FUNCTION reject_mail_attachment_claim() RETURNS trigger AS $$ BEGIN IF NEW.context = 'MAIL_ENTRY' THEN RAISE EXCEPTION 'test mail attachment failure'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`);
    await db.$executeRawUnsafe(`CREATE TRIGGER reject_mail_attachment_claim BEFORE UPDATE ON "Attachment" FOR EACH ROW EXECUTE FUNCTION reject_mail_attachment_claim()`);
    try {
      await expect(sendMail(form({ draftId: saved.draftId, recipientId: [first.id, second.id], subject: "Atomic Mail", body }))).rejects.toThrow();
    } finally {
      await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS reject_mail_attachment_claim ON "Attachment"`);
      await db.$executeRawUnsafe(`DROP FUNCTION IF EXISTS reject_mail_attachment_claim()`);
    }
    expect(await db.mailThread.count()).toBe(0);
    expect(await db.mailDraft.count({ where: { id: saved.draftId } })).toBe(1);
    expect(await db.attachment.findUniqueOrThrow({ where: { id: attachment.id } })).toEqual(expect.objectContaining({ context: "MAIL_DRAFT", targetId: saved.draftId }));
  });

  it("delivers a shared Staff Mailbox thread with team-wide state, named replies, drafts, and role-based access", async () => {
    const [member, moderator, admin, outsider] = await Promise.all([
      createTestUser({ displayName: "Needs Help", username: "needs_help" }),
      createTestUser({ role: "MODERATOR", displayName: "Mod Reply", username: "mod_reply" }),
      createTestUser({ role: "ADMIN", displayName: "New Admin", username: "new_admin" }),
      createTestUser({ displayName: "Outsider", username: "mail_outsider" }),
    ]);

    state.user = member;
    state.uploads = true;
    const attachment = await db.attachment.create({ data: { key: "staff-mailbox-image", url: "https://utfs.io/f/staff-mailbox-image", name: "evidence.png", size: 42, access: "PRIVATE", userId: member.id } });
    const body = `Please help ![evidence](/api/attachments/${attachment.id})`;
    const draft = await saveMailDraft(form({ staffMailbox: "true", subject: "Shared question", body }));
    expect(draft).toEqual(expect.objectContaining({ status: "saved" }));
    expect(await db.mailDraft.findFirstOrThrow()).toEqual(expect.objectContaining({ staffMailbox: true }));
    await expect(sendMail(form({ draftId: draft.status === "saved" ? draft.draftId : undefined, staffMailbox: "true", subject: "Shared question", body }))).rejects.toThrow("redirect:/mail/");

    const thread = await db.mailThread.findFirstOrThrow({ include: { participants: true, staffMailbox: true, entries: true } });
    expect(thread.participants).toEqual([expect.objectContaining({ userId: member.id })]);
    expect(thread.staffMailbox).toEqual(expect.objectContaining({ location: "INBOX", starred: false, lastReadAt: null }));
    expect(await getStaffMailCounts(moderator)).toEqual(expect.objectContaining({ inbox: 1, unread: 1 }));
    expect((await listStaffMail(moderator)).items).toHaveLength(1);
    expect((await listStaffMail(admin)).items).toHaveLength(1);
    expect((await listStaffMail(outsider)).items).toHaveLength(0);
    await expect(canAccessMailEntry(moderator, thread.entries[0]!.id)).resolves.toBe(true);
    await expect(canAccessMailEntry(outsider, thread.entries[0]!.id)).resolves.toBe(false);
    const claimedAttachment = await db.attachment.findUniqueOrThrow({ where: { id: attachment.id } });
    await expect(canAccessPrivateAttachment(claimedAttachment, moderator)).resolves.toBe(true);
    await expect(canAccessPrivateAttachment(claimedAttachment, outsider)).resolves.toBe(false);

    state.user = moderator;
    await replyToMail(form({ threadId: thread.id, body: "A named staff answer" }));
    const staffEntry = await db.mailEntry.findFirstOrThrow({ where: { threadId: thread.id, authorId: moderator.id } });
    expect(staffEntry.body).toBe("A named staff answer");
    expect(await db.mailParticipant.findUniqueOrThrow({ where: { threadId_userId: { threadId: thread.id, userId: member.id } } })).toEqual(expect.objectContaining({ location: "INBOX", removedAt: null }));

    await setMailLocation(form({ threadId: thread.id, location: "ARCHIVE" }));
    await toggleMailStar(form({ threadId: thread.id }));
    await setMailReadState(form({ threadId: thread.id, unread: "false" }));
    expect((await listStaffMail(admin, { folder: "archive" })).items).toHaveLength(1);
    expect(await db.staffMailboxThread.findUniqueOrThrow({ where: { threadId: thread.id } })).toEqual(expect.objectContaining({ location: "ARCHIVE", starred: true, forcedUnread: false, lastReadAt: expect.any(Date) }));

    await db.block.create({ data: { blockerId: member.id, blockedId: moderator.id } });
    state.user = member;
    await replyToMail(form({ threadId: thread.id, body: "Blocks do not suppress collective mail" }));
    expect(await db.staffMailboxThread.findUniqueOrThrow({ where: { threadId: thread.id } })).toEqual(expect.objectContaining({ location: "INBOX", removedAt: null }));

    const demoted = await db.user.update({ where: { id: moderator.id }, data: { role: "MEMBER" } });
    expect((await listStaffMail(demoted)).items).toHaveLength(0);
    await expect(canAccessMailEntry(demoted, staffEntry.id)).resolves.toBe(false);
    await expect(canAccessPrivateAttachment(claimedAttachment, demoted)).resolves.toBe(false);
  });

  it("orders empty recipient suggestions by recent follows and excludes blocked or inactive follows", async () => {
    const sender = await createTestUser();
    const [older, newer, blocked, inactive] = await Promise.all([createTestUser(), createTestUser(), createTestUser(), createTestUser({ status: "SUSPENDED" })]);
    await db.follow.createMany({ data: [
      { followerId: sender.id, followingId: older.id, createdAt: new Date("2026-01-01") },
      { followerId: sender.id, followingId: newer.id, createdAt: new Date("2026-02-01") },
      { followerId: sender.id, followingId: blocked.id, createdAt: new Date("2026-03-01") },
      { followerId: sender.id, followingId: inactive.id, createdAt: new Date("2026-04-01") },
    ] });
    await db.block.create({ data: { blockerId: blocked.id, blockedId: sender.id } });
    state.user = sender;
    const suggestions = await searchMailRecipients("");
    expect(suggestions.map((item) => item.id)).toEqual(["staff-mailbox", newer.id, older.id]);
  });
});
