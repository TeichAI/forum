"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { claimAttachments } from "@/lib/attachments";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getMailThreadAccess } from "@/lib/mail-access";
import {
  consumeRateLimit,
  consumeMutationRateLimit,
  consumeUserMutation,
  mailSendPolicies,
  mailThreadPolicy,
  RATE_LIMIT_POLICIES,
  rateLimitedActionState,
  type RateLimitedActionState,
} from "@/lib/rate-limit";

export type MailActionState =
  | { status: "idle" | "saved" | "success"; message?: string; draftId?: string; savedAt?: string }
  | { status: "error"; message: string; fieldErrors?: { subject?: string; recipients?: string; body?: string } }
  | RateLimitedActionState;

const idSchema = z.string().cuid();
const subjectSchema = z.string().trim().min(1, "Add a subject.").max(160, "Keep the subject under 160 characters.");
const bodySchema = z.string().trim().min(1, "Write a message.").max(50_000, "Keep the message under 50,000 characters.");
const draftTextSchema = z.string().max(50_000).catch("");

function refreshMail(threadId?: string) {
  revalidatePath("/mail");
  if (threadId) revalidatePath(`/mail/${threadId}`);
}

async function mailLimit(user: { clerkId: string; role: string }) {
  const result = await consumeUserMutation(user, RATE_LIMIT_POLICIES.interaction);
  return result.allowed ? null : rateLimitedActionState(result);
}

function recipientIds(formData: FormData) {
  return [...new Set(formData.getAll("recipientId").map(String).filter(Boolean))];
}

function staffMailboxTarget(formData: FormData) {
  return formData.get("staffMailbox") === "true";
}

export type MailUserRecipient = {
  kind: "user";
  id: string;
  displayName: string;
  username: string;
  imageUrl: string | null;
  role: string;
};

export type StaffMailboxRecipient = {
  kind: "staff-mailbox";
  id: "staff-mailbox";
  displayName: "Staff Mailbox";
  username: "staff";
  imageUrl: null;
  role: "STAFF_MAILBOX";
};

export type MailRecipientOption = MailUserRecipient | StaffMailboxRecipient;

const STAFF_MAILBOX_RECIPIENT: StaffMailboxRecipient = {
  kind: "staff-mailbox",
  id: "staff-mailbox",
  displayName: "Staff Mailbox",
  username: "staff",
  imageUrl: null,
  role: "STAFF_MAILBOX",
};

async function availableRecipients(sender: { id: string; role: string }, ids: string[]) {
  const max = sender.role === "MODERATOR" || sender.role === "ADMIN" ? 25 : 1;
  if (ids.length < 1 || ids.length > max || (sender.role === "MEMBER" && ids.length !== 1)) {
    throw new Error(max === 1 ? "Choose exactly one recipient." : "Choose between 1 and 25 recipients.");
  }
  if (ids.includes(sender.id)) throw new Error("You cannot send mail to yourself.");
  const recipients = await db.user.findMany({
    where: { id: { in: ids }, status: "ACTIVE" },
    select: { id: true, username: true, displayName: true, imageUrl: true, role: true },
  });
  if (recipients.length !== ids.length) throw new Error("One or more recipients are unavailable.");
  const blocked = await db.block.findFirst({
    where: {
      OR: [
        { blockerId: sender.id, blockedId: { in: ids } },
        { blockerId: { in: ids }, blockedId: sender.id },
      ],
    },
    select: { blockerId: true },
  });
  if (blocked) throw new Error("Mail is unavailable for one or more recipients.");
  const byId = new Map(recipients.map((recipient) => [recipient.id, recipient]));
  return ids.map((id) => byId.get(id)!);
}

export async function searchMailRecipients(query: string) {
  const user = await requireUser();
  const q = z.string().trim().max(80).catch("").parse(query);
  if (q.length === 1) return [];
  const limited = await consumeRateLimit({ kind: "user", value: user.clerkId }, [RATE_LIMIT_POLICIES.searchUser]);
  if (!limited.allowed) return [];
  const blocked = await db.block.findMany({
    where: { OR: [{ blockerId: user.id }, { blockedId: user.id }] },
    select: { blockerId: true, blockedId: true },
  });
  const excluded = new Set([user.id, ...blocked.flatMap((item) => [item.blockerId, item.blockedId])]);
  if (!q) {
    if (user.role !== "MEMBER") return [];
    const follows = await db.follow.findMany({
      where: { followerId: user.id, followingId: { notIn: [...excluded] }, following: { status: "ACTIVE" } },
      include: { following: { select: { id: true, displayName: true, username: true, imageUrl: true, role: true } } },
      orderBy: { createdAt: "desc" },
      take: 8,
    });
    return [STAFF_MAILBOX_RECIPIENT, ...follows.map(({ following }) => ({ kind: "user" as const, ...following }))];
  }
  if (q.length < 2) return [];
  const users = await db.user.findMany({
    where: {
      id: { notIn: [...excluded] },
      status: "ACTIVE",
      OR: [{ displayName: { contains: q, mode: "insensitive" } }, { username: { contains: q.replace(/^@/, ""), mode: "insensitive" } }],
    },
    select: { id: true, displayName: true, username: true, imageUrl: true, role: true },
    orderBy: [{ displayName: "asc" }, { username: "asc" }],
    take: 8,
  });
  const staffMatch = user.role === "MEMBER" && "staff mailbox".includes(q.toLowerCase());
  return [...(staffMatch ? [STAFF_MAILBOX_RECIPIENT] : []), ...users.map((recipient) => ({ kind: "user" as const, ...recipient }))];
}

export async function saveMailDraft(formData: FormData): Promise<MailActionState> {
  const user = await requireUser();
  const limited = await mailLimit(user);
  if (limited) return limited;
  const draftId = idSchema.optional().safeParse(formData.get("draftId") || undefined);
  const threadId = idSchema.optional().safeParse(formData.get("threadId") || undefined);
  if (!draftId.success || !threadId.success) return { status: "error", message: "This draft is no longer valid." };
  const subject = z.string().max(160).catch("").parse(formData.get("subject") ?? "");
  const body = draftTextSchema.parse(formData.get("body") ?? "");
  const ids = recipientIds(formData);
  const staffMailbox = staffMailboxTarget(formData);
  try {
    if (staffMailbox && (user.role !== "MEMBER" || ids.length)) throw new Error("Staff Mailbox must be the only recipient and is available to members only.");
    if (ids.length) await availableRecipients(user, ids);
    if (threadId.data) {
      if (!await getMailThreadAccess(user, threadId.data)) return { status: "error", message: "This mail thread is unavailable." };
    }
    const saved = await db.$transaction(async (tx) => {
      let result;
      if (draftId.data) {
        const owned = await tx.mailDraft.findFirst({ where: { id: draftId.data, ownerId: user.id }, select: { id: true } });
        if (!owned) throw new Error("This draft is no longer available.");
        result = await tx.mailDraft.update({
          where: { id: owned.id },
          data: {
            subject,
            body,
            staffMailbox,
            threadId: threadId.data,
            recipients: { deleteMany: {}, create: ids.map((recipientId) => ({ recipientId })) },
          },
        });
      } else {
        result = await tx.mailDraft.create({
          data: { ownerId: user.id, threadId: threadId.data, subject, body, staffMailbox, recipients: { create: ids.map((recipientId) => ({ recipientId })) } },
        });
      }
      await claimAttachments(body, user.id, "MAIL_DRAFT", result.id, result.id, tx);
      return result;
    });
    refreshMail(threadId.data);
    return { status: "saved", message: "Draft saved", draftId: saved.id, savedAt: saved.updatedAt.toISOString() };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "We couldn’t save this draft." };
  }
}

export async function deleteMailDraft(formData: FormData): Promise<MailActionState> {
  const user = await requireUser();
  const limited = await mailLimit(user);
  if (limited) return limited;
  const parsed = idSchema.safeParse(formData.get("draftId"));
  if (!parsed.success) return { status: "error", message: "Choose a valid draft." };
  const deleted = await db.$transaction(async (tx) => {
    const result = await tx.mailDraft.deleteMany({ where: { id: parsed.data, ownerId: user.id } });
    if (result.count) await tx.attachment.updateMany({ where: { userId: user.id, context: "MAIL_DRAFT", targetId: parsed.data }, data: { context: "DRAFT", targetId: null } });
    return result;
  });
  if (!deleted.count) return { status: "error", message: "This draft is no longer available." };
  refreshMail();
  return { status: "success", message: "Draft deleted." };
}

export async function sendMail(formData: FormData): Promise<MailActionState | never> {
  const user = await requireUser();
  const ids = recipientIds(formData);
  const staffMailbox = staffMailboxTarget(formData);
  const subject = subjectSchema.safeParse(formData.get("subject"));
  const body = bodySchema.safeParse(formData.get("body"));
  if (!subject.success || !body.success) {
    return {
      status: "error",
      message: "Check the highlighted fields and try again.",
      fieldErrors: { subject: subject.error?.issues[0]?.message, body: body.error?.issues[0]?.message },
    };
  }
  let recipients: Awaited<ReturnType<typeof availableRecipients>>;
  try {
    if (staffMailbox) {
      if (user.role !== "MEMBER" || ids.length) throw new Error("Staff Mailbox must be the only recipient and is available to members only.");
      recipients = [];
    } else {
      recipients = await availableRecipients(user, ids);
    }
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Choose valid recipients.", fieldErrors: { recipients: "Check the recipients." } };
  }
  const rate = await consumeMutationRateLimit({ kind: "user", value: user.clerkId }, mailSendPolicies(user, Math.max(recipients.length, 1)));
  if (!rate.allowed) return rateLimitedActionState(rate);
  const rawDraftId = formData.get("draftId");
  const draftId = rawDraftId ? idSchema.parse(rawDraftId) : undefined;
  if (draftId && !await db.mailDraft.findFirst({ where: { id: draftId, ownerId: user.id }, select: { id: true } })) {
    return { status: "error", message: "This draft is no longer available." };
  }
  const now = new Date();
  const created = await db.$transaction(async (tx) => {
    const sent = [];
    if (staffMailbox) {
      const thread = await tx.mailThread.create({
        data: {
          subject: subject.data,
          lastActivityAt: now,
          entries: { create: { authorId: user.id, body: body.data, createdAt: now } },
          participants: { create: { userId: user.id, location: "INBOX", lastReadAt: now } },
          staffMailbox: { create: { location: "INBOX" } },
        },
        include: { entries: { select: { id: true } } },
      });
      sent.push({ threadId: thread.id, entryId: thread.entries[0]!.id });
    }
    for (const recipient of recipients) {
      const thread = await tx.mailThread.create({
        data: {
          subject: subject.data,
          lastActivityAt: now,
          entries: { create: { authorId: user.id, body: body.data, createdAt: now } },
          participants: {
            create: [
              { userId: user.id, location: "INBOX", lastReadAt: now },
              { userId: recipient.id, location: "INBOX" },
            ],
          },
        },
        include: { entries: { select: { id: true } } },
      });
      sent.push({ threadId: thread.id, entryId: thread.entries[0]!.id });
    }
    if (draftId) await tx.mailDraft.delete({ where: { id: draftId } });
    await claimAttachments(body.data, user.id, "MAIL_ENTRY", sent[0]!.entryId, draftId, tx);
    return sent;
  });
  refreshMail();
  if (created.length === 1) redirect(`/mail/${created[0]!.threadId}`);
  redirect("/mail?folder=sent");
}

export async function replyToMail(formData: FormData): Promise<MailActionState> {
  const user = await requireUser();
  const threadId = idSchema.safeParse(formData.get("threadId"));
  const body = bodySchema.safeParse(formData.get("body"));
  if (!threadId.success || !body.success) return { status: "error", message: body.error?.issues[0]?.message ?? "This mail thread is invalid." };
  const rate = await consumeUserMutation(user, RATE_LIMIT_POLICIES.mail, [mailThreadPolicy(threadId.data)]);
  if (!rate.allowed) return rateLimitedActionState(rate);
  const access = await getMailThreadAccess(user, threadId.data);
  if (!access) return { status: "error", message: "This mail thread is unavailable." };
  const thread = await db.mailThread.findUnique({
    where: { id: threadId.data },
    include: { staffMailbox: true, participants: { include: { user: { select: { id: true, status: true } } } } },
  });
  if (!thread) return { status: "error", message: "This mail thread is unavailable." };
  const collective = Boolean(thread.staffMailbox);
  const recipient = collective
    ? thread.participants[0]?.user
    : thread.participants.find((item) => item.userId !== user.id)?.user;
  if (!recipient || recipient.status !== "ACTIVE") return { status: "error", message: "The recipient is unavailable." };
  if (!collective) {
    const blocked = await db.block.findFirst({ where: { OR: [{ blockerId: user.id, blockedId: recipient.id }, { blockerId: recipient.id, blockedId: user.id }] } });
    if (blocked) return { status: "error", message: "Mail is unavailable for this member." };
  }
  const now = new Date();
  await db.$transaction(async (tx) => {
    const created = await tx.mailEntry.create({ data: { threadId: threadId.data, authorId: user.id, body: body.data, createdAt: now } });
    await tx.mailThread.update({ where: { id: threadId.data }, data: { lastActivityAt: now } });
    if (collective) {
      if (access.kind === "staff") {
        await tx.staffMailboxThread.update({ where: { threadId: threadId.data }, data: { location: "INBOX", removedAt: null, forcedUnread: false, lastReadAt: now } });
        await tx.mailParticipant.update({ where: { threadId_userId: { threadId: threadId.data, userId: recipient.id } }, data: { location: "INBOX", removedAt: null, forcedUnread: false } });
      } else {
        await tx.mailParticipant.update({ where: { threadId_userId: { threadId: threadId.data, userId: user.id } }, data: { location: "INBOX", removedAt: null, forcedUnread: false, lastReadAt: now } });
        await tx.staffMailboxThread.update({ where: { threadId: threadId.data }, data: { location: "INBOX", removedAt: null, forcedUnread: false } });
      }
    } else {
      await tx.mailParticipant.update({ where: { threadId_userId: { threadId: threadId.data, userId: user.id } }, data: { location: "INBOX", removedAt: null, forcedUnread: false, lastReadAt: now } });
      await tx.mailParticipant.update({ where: { threadId_userId: { threadId: threadId.data, userId: recipient.id } }, data: { location: "INBOX", removedAt: null, forcedUnread: false } });
    }
    await claimAttachments(body.data, user.id, "MAIL_ENTRY", created.id, undefined, tx);
    return created;
  });
  refreshMail(threadId.data);
  return { status: "success", message: "Reply sent." };
}

async function ownedMailboxState(threadId: string, user: Awaited<ReturnType<typeof requireUser>>) {
  return getMailThreadAccess(user, threadId);
}

export async function setMailLocation(formData: FormData): Promise<MailActionState> {
  const user = await requireUser();
  const limited = await mailLimit(user);
  if (limited) return limited;
  const parsed = z.object({ threadId: idSchema, location: z.enum(["INBOX", "ARCHIVE", "TRASH"]) }).safeParse({ threadId: formData.get("threadId"), location: formData.get("location") });
  const access = parsed.success ? await ownedMailboxState(parsed.data.threadId, user) : null;
  if (!parsed.success || !access) return { status: "error", message: "This mail thread is unavailable." };
  if (access.kind === "staff") await db.staffMailboxThread.update({ where: { threadId: parsed.data.threadId }, data: { location: parsed.data.location } });
  else await db.mailParticipant.update({ where: { threadId_userId: { threadId: parsed.data.threadId, userId: user.id } }, data: { location: parsed.data.location } });
  refreshMail(parsed.data.threadId);
  return { status: "success", message: parsed.data.location === "ARCHIVE" ? "Mail archived." : parsed.data.location === "TRASH" ? "Mail moved to trash." : "Mail restored to inbox." };
}

export async function toggleMailStar(formData: FormData): Promise<MailActionState> {
  const user = await requireUser();
  const limited = await mailLimit(user);
  if (limited) return limited;
  const parsed = idSchema.safeParse(formData.get("threadId"));
  const access = parsed.success ? await ownedMailboxState(parsed.data, user) : null;
  if (!parsed.success || !access) return { status: "error", message: "This mail thread is unavailable." };
  if (access.kind === "staff") await db.staffMailboxThread.update({ where: { threadId: parsed.data }, data: { starred: !access.state.starred } });
  else await db.mailParticipant.update({ where: { threadId_userId: { threadId: parsed.data, userId: user.id } }, data: { starred: !access.state.starred } });
  refreshMail(parsed.data);
  return { status: "success" };
}

export async function setMailReadState(formData: FormData): Promise<MailActionState> {
  const user = await requireUser();
  const limited = await mailLimit(user);
  if (limited) return limited;
  const parsed = z.object({ threadId: idSchema, unread: z.enum(["true", "false"]).default("false") }).safeParse({ threadId: formData.get("threadId"), unread: formData.get("unread") ?? "false" });
  const access = parsed.success ? await ownedMailboxState(parsed.data.threadId, user) : null;
  if (!parsed.success || !access) return { status: "error", message: "This mail thread is unavailable." };
  const unread = parsed.data.unread === "true";
  const data = { forcedUnread: unread, lastReadAt: unread ? undefined : new Date() };
  if (access.kind === "staff") await db.staffMailboxThread.update({ where: { threadId: parsed.data.threadId }, data });
  else await db.mailParticipant.update({ where: { threadId_userId: { threadId: parsed.data.threadId, userId: user.id } }, data });
  refreshMail(parsed.data.threadId);
  return { status: "success" };
}

export async function removeMailboxCopy(formData: FormData): Promise<MailActionState> {
  const user = await requireUser();
  const limited = await mailLimit(user);
  if (limited) return limited;
  const parsed = idSchema.safeParse(formData.get("threadId"));
  const access = parsed.success ? await ownedMailboxState(parsed.data, user) : null;
  if (!parsed.success || !access) return { status: "error", message: "This mail thread is unavailable." };
  if (access.state.location !== "TRASH") return { status: "error", message: "Move mail to Trash before deleting it forever." };
  if (access.kind === "staff") await db.staffMailboxThread.update({ where: { threadId: parsed.data }, data: { removedAt: new Date() } });
  else await db.mailParticipant.update({ where: { threadId_userId: { threadId: parsed.data, userId: user.id } }, data: { removedAt: new Date() } });
  refreshMail(parsed.data);
  return { status: "success", message: "Your mailbox copy was removed." };
}
