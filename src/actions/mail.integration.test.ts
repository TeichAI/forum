import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@prisma/client";

const state = vi.hoisted(() => ({ user: null as User | null, uploads: false }));
vi.mock("@/lib/auth", () => ({ requireUser: vi.fn(async () => state.user) }));
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
} from "./mail";
import { blockMember, reportContent } from "./forum";
import { db } from "@/lib/db";
import { getMailCounts, listMail } from "@/lib/mail";
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
    const attachment = await db.attachment.create({ data: { key: "mail-image", url: "https://utfs.io/f/mail-image", name: "pond.png", size: 42, userId: sender.id } });
    const saved = await saveMailDraft(form({ recipientId: recipient.id, subject: "Draft subject", body: `Inline ![pond](${attachment.url})` }));
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
    const attachment = await db.attachment.create({ data: { key: "mail-rollback", url: "https://utfs.io/f/mail-rollback", name: "mail.png", size: 42, userId: sender.id } });
    const saved = await saveMailDraft(form({ recipientId: [first.id, second.id], subject: "Atomic Mail", body: `Inline ![pond](${attachment.url})` }));
    if (saved.status !== "saved") throw new Error("Expected a saved draft");
    await db.$executeRawUnsafe(`CREATE FUNCTION reject_mail_attachment_claim() RETURNS trigger AS $$ BEGIN IF NEW.context = 'MAIL_ENTRY' THEN RAISE EXCEPTION 'test mail attachment failure'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`);
    await db.$executeRawUnsafe(`CREATE TRIGGER reject_mail_attachment_claim BEFORE UPDATE ON "Attachment" FOR EACH ROW EXECUTE FUNCTION reject_mail_attachment_claim()`);
    try {
      await expect(sendMail(form({ draftId: saved.draftId, recipientId: [first.id, second.id], subject: "Atomic Mail", body: `Inline ![pond](${attachment.url})` }))).rejects.toThrow();
    } finally {
      await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS reject_mail_attachment_claim ON "Attachment"`);
      await db.$executeRawUnsafe(`DROP FUNCTION IF EXISTS reject_mail_attachment_claim()`);
    }
    expect(await db.mailThread.count()).toBe(0);
    expect(await db.mailDraft.count({ where: { id: saved.draftId } })).toBe(1);
    expect(await db.attachment.findUniqueOrThrow({ where: { id: attachment.id } })).toEqual(expect.objectContaining({ context: "MAIL_DRAFT", targetId: saved.draftId }));
  });
});
