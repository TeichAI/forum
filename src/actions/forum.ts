"use server";

import { NotificationType, ReportTargetType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getVerifiedUserRole, requireModerator, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { canComment, canStartDiscussion } from "@/lib/space-posting-permissions";
import { uploadsEnabled } from "@/lib/upload-capability";
import { parseMentions, safeReturnPath, slugify, threadSlug } from "@/lib/utils";

const titleSchema = z.string().trim().min(5).max(160);
const bodySchema = z.string().trim().min(2).max(50_000);

async function claimAttachments(body: string, userId: string, context: "THREAD" | "REPLY" | "MESSAGE", targetId: string) {
  if (!uploadsEnabled()) return;
  const drafts = await db.attachment.findMany({ where: { userId, context: "DRAFT" }, select: { id: true, url: true } });
  const ids = drafts.filter((attachment) => body.includes(attachment.url)).map((attachment) => attachment.id);
  if (ids.length) await db.attachment.updateMany({ where: { id: { in: ids } }, data: { context, targetId } });
}

async function notifyMentions(body: string, actorId: string, data: { threadId?: string; replyId?: string }) {
  const usernames = parseMentions(body);
  if (!usernames.length) return;
  const users = await db.user.findMany({ where: { username: { in: usernames }, status: "ACTIVE", id: { not: actorId } }, select: { id: true } });
  if (users.length) {
    await db.notification.createMany({
      data: users.map((user) => ({ type: "MENTION", recipientId: user.id, actorId, ...data })),
    });
  }
}

export async function createThread(formData: FormData) {
  const user = await requireUser();
  const title = titleSchema.parse(formData.get("title"));
  const body = bodySchema.parse(formData.get("body"));
  const categoryId = z.string().cuid().parse(formData.get("categoryId"));
  const rawTags = z.string().max(180).catch("").parse(formData.get("tags") ?? "");
  const tags = [...new Set(rawTags.split(",").map((tag) => slugify(tag.trim())).filter(Boolean))].slice(0, 5);

  const category = await db.category.findUnique({ where: { id: categoryId }, select: { id: true, postingPolicy: true } });
  if (!category) throw new Error("Category not found");
  if (!canStartDiscussion(user.role, category.postingPolicy)) {
    throw new Error("You do not have permission to start a discussion in this space");
  }

  const thread = await db.thread.create({
    data: {
      title,
      body,
      slug: threadSlug(title),
      authorId: user.id,
      categoryId,
      tags: {
        create: tags.map((slug) => ({
          tag: { connectOrCreate: { where: { slug }, create: { slug, name: slug.replace(/-/g, " ") } } },
        })),
      },
    },
  });
  await claimAttachments(body, user.id, "THREAD", thread.id);
  await notifyMentions(body, user.id, { threadId: thread.id });
  redirect(`/t/${thread.slug}`);
}

export async function createReply(formData: FormData) {
  const user = await requireUser();
  const threadId = z.string().cuid().parse(formData.get("threadId"));
  const body = bodySchema.parse(formData.get("body"));
  const thread = await db.thread.findUnique({
    where: { id: threadId },
    select: {
      id: true,
      slug: true,
      authorId: true,
      isLocked: true,
      status: true,
      category: { select: { postingPolicy: true } },
    },
  });
  if (!thread || thread.status !== "PUBLISHED") throw new Error("Thread not found");
  if (thread.isLocked) throw new Error("This thread is locked");
  if (!canComment(user.role, thread.category.postingPolicy)) {
    throw new Error("You do not have permission to comment in this space");
  }

  const reply = await db.$transaction(async (tx) => {
    const created = await tx.reply.create({ data: { body, threadId, authorId: user.id } });
    await tx.thread.update({ where: { id: threadId }, data: { bumpedAt: new Date() } });
    if (thread.authorId !== user.id) {
      await tx.notification.create({ data: { type: "REPLY", recipientId: thread.authorId, actorId: user.id, threadId, replyId: created.id } });
    }
    return created;
  });
  await claimAttachments(body, user.id, "REPLY", reply.id);
  await notifyMentions(body, user.id, { threadId, replyId: reply.id });
  revalidatePath(`/t/${thread.slug}`);
}

export async function toggleThreadVote(formData: FormData) {
  const user = await requireUser();
  const threadId = z.string().cuid().parse(formData.get("threadId"));
  const returnTo = safeReturnPath(formData.get("returnTo"));
  const thread = await db.thread.findUnique({ where: { id: threadId }, select: { authorId: true, status: true } });
  if (!thread || thread.status !== "PUBLISHED") throw new Error("Thread not found");
  const existing = await db.threadVote.findUnique({ where: { userId_threadId: { userId: user.id, threadId } } });
  if (existing) {
    await db.threadVote.delete({ where: { userId_threadId: { userId: user.id, threadId } } });
  } else {
    await db.threadVote.create({ data: { userId: user.id, threadId } });
    if (thread.authorId !== user.id) await db.notification.create({ data: { type: "UPVOTE", recipientId: thread.authorId, actorId: user.id, threadId } });
  }
  revalidatePath(returnTo);
}

export async function toggleReplyVote(formData: FormData) {
  const user = await requireUser();
  const replyId = z.string().cuid().parse(formData.get("replyId"));
  const returnTo = safeReturnPath(formData.get("returnTo"));
  const reply = await db.reply.findUnique({ where: { id: replyId }, select: { authorId: true, threadId: true, status: true } });
  if (!reply || reply.status !== "PUBLISHED") throw new Error("Reply not found");
  const existing = await db.replyVote.findUnique({ where: { userId_replyId: { userId: user.id, replyId } } });
  if (existing) {
    await db.replyVote.delete({ where: { userId_replyId: { userId: user.id, replyId } } });
  } else {
    await db.replyVote.create({ data: { userId: user.id, replyId } });
    if (reply.authorId !== user.id) await db.notification.create({ data: { type: "UPVOTE", recipientId: reply.authorId, actorId: user.id, replyId, threadId: reply.threadId } });
  }
  revalidatePath(returnTo);
}

export async function toggleBookmark(formData: FormData) {
  const user = await requireUser();
  const threadId = z.string().cuid().parse(formData.get("threadId"));
  const returnTo = safeReturnPath(formData.get("returnTo"));
  const existing = await db.bookmark.findUnique({ where: { userId_threadId: { userId: user.id, threadId } } });
  if (existing) await db.bookmark.delete({ where: { userId_threadId: { userId: user.id, threadId } } });
  else await db.bookmark.create({ data: { userId: user.id, threadId } });
  revalidatePath(returnTo);
}

export async function toggleFollow(formData: FormData) {
  const user = await requireUser();
  const followingId = z.string().cuid().parse(formData.get("userId"));
  const returnTo = safeReturnPath(formData.get("returnTo"));
  if (followingId === user.id) throw new Error("You cannot follow yourself");
  const existing = await db.follow.findUnique({ where: { followerId_followingId: { followerId: user.id, followingId } } });
  if (existing) await db.follow.delete({ where: { followerId_followingId: { followerId: user.id, followingId } } });
  else {
    await db.follow.create({ data: { followerId: user.id, followingId } });
    await db.notification.create({ data: { type: "FOLLOW", recipientId: followingId, actorId: user.id } });
  }
  revalidatePath(returnTo);
}

export async function updateThread(formData: FormData) {
  const user = await requireUser();
  const threadId = z.string().cuid().parse(formData.get("threadId"));
  const title = titleSchema.parse(formData.get("title"));
  const body = bodySchema.parse(formData.get("body"));
  const thread = await db.thread.findUnique({ where: { id: threadId } });
  if (!thread || (thread.authorId !== user.id && user.role === "MEMBER")) throw new Error("You cannot edit this discussion");
  await db.thread.update({ where: { id: threadId }, data: { title, body, editedAt: new Date() } });
  await claimAttachments(body, user.id, "THREAD", threadId);
  revalidatePath(`/t/${thread.slug}`);
  redirect(`/t/${thread.slug}`);
}

export async function deleteThread(formData: FormData) {
  const user = await requireUser();
  const threadId = z.string().cuid().parse(formData.get("threadId"));
  const thread = await db.thread.findUnique({ where: { id: threadId } });
  if (!thread || (thread.authorId !== user.id && user.role === "MEMBER")) throw new Error("You cannot delete this discussion");
  await db.thread.update({ where: { id: threadId }, data: { status: "DELETED", deletedAt: new Date() } });
  revalidatePath("/");
  redirect("/");
}

export async function updateReply(formData: FormData) {
  const user = await requireUser();
  const replyId = z.string().cuid().parse(formData.get("replyId"));
  const body = bodySchema.parse(formData.get("body"));
  const reply = await db.reply.findUnique({ where: { id: replyId }, include: { thread: { select: { slug: true } } } });
  if (!reply || (reply.authorId !== user.id && user.role === "MEMBER")) throw new Error("You cannot edit this reply");
  await db.reply.update({ where: { id: replyId }, data: { body, editedAt: new Date() } });
  await claimAttachments(body, user.id, "REPLY", replyId);
  revalidatePath(`/t/${reply.thread.slug}`);
}

export async function deleteReply(formData: FormData) {
  const user = await requireUser();
  const replyId = z.string().cuid().parse(formData.get("replyId"));
  const reply = await db.reply.findUnique({ where: { id: replyId }, include: { thread: { select: { slug: true } } } });
  if (!reply || (reply.authorId !== user.id && user.role === "MEMBER")) throw new Error("You cannot delete this reply");
  await db.reply.update({ where: { id: replyId }, data: { status: "DELETED", deletedAt: new Date() } });
  revalidatePath(`/t/${reply.thread.slug}`);
}

export async function startConversation(formData: FormData) {
  const user = await requireUser();
  const targetId = z.string().cuid().parse(formData.get("userId"));
  if (targetId === user.id) throw new Error("You cannot message yourself");
  const blocked = await db.block.findFirst({
    where: { OR: [{ blockerId: user.id, blockedId: targetId }, { blockerId: targetId, blockedId: user.id }] },
  });
  if (blocked) throw new Error("Messaging is unavailable for this member");
  const [memberOneId, memberTwoId] = [user.id, targetId].sort();
  const conversation = await db.conversation.upsert({
    where: { pairKey: `${memberOneId}:${memberTwoId}` },
    update: {},
    create: { pairKey: `${memberOneId}:${memberTwoId}`, memberOneId, memberTwoId },
  });
  redirect(`/messages/${conversation.id}`);
}

export async function sendMessage(formData: FormData) {
  const user = await requireUser();
  const conversationId = z.string().cuid().parse(formData.get("conversationId"));
  const body = bodySchema.parse(formData.get("body"));
  const conversation = await db.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation || (conversation.memberOneId !== user.id && conversation.memberTwoId !== user.id)) throw new Error("Conversation not found");
  const recipientId = conversation.memberOneId === user.id ? conversation.memberTwoId : conversation.memberOneId;
  const blocked = await db.block.findFirst({ where: { OR: [{ blockerId: user.id, blockedId: recipientId }, { blockerId: recipientId, blockedId: user.id }] } });
  if (blocked) throw new Error("Messaging is unavailable for this member");
  const message = await db.$transaction(async (tx) => {
    const created = await tx.message.create({ data: { conversationId, authorId: user.id, body } });
    await tx.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: new Date() } });
    await tx.notification.create({ data: { type: "MESSAGE", recipientId, actorId: user.id, conversationId, messageId: created.id } });
    return created;
  });
  await claimAttachments(body, user.id, "MESSAGE", message.id);
  revalidatePath(`/messages/${conversationId}`);
}

export async function blockMember(formData: FormData) {
  const user = await requireUser();
  const blockedId = z.string().cuid().parse(formData.get("userId"));
  if (blockedId === user.id) throw new Error("You cannot block yourself");
  await db.block.upsert({ where: { blockerId_blockedId: { blockerId: user.id, blockedId } }, update: {}, create: { blockerId: user.id, blockedId } });
  revalidatePath("/messages");
}

export async function reportContent(formData: FormData) {
  const user = await requireUser();
  const targetType = z.nativeEnum(ReportTargetType).parse(formData.get("targetType"));
  const targetId = z.string().cuid().parse(formData.get("targetId"));
  const reason = z.string().trim().min(3).max(80).parse(formData.get("reason"));
  const details = z.string().trim().max(1000).parse(formData.get("details") ?? "");
  const targetExists = targetType === "THREAD"
    ? Boolean(await db.thread.findUnique({ where: { id: targetId }, select: { id: true } }))
    : targetType === "REPLY"
      ? Boolean(await db.reply.findUnique({ where: { id: targetId }, select: { id: true } }))
      : targetType === "USER"
        ? Boolean(await db.user.findUnique({ where: { id: targetId }, select: { id: true } }))
        : Boolean(await db.message.findUnique({ where: { id: targetId, conversation: { OR: [{ memberOneId: user.id }, { memberTwoId: user.id }] } }, select: { id: true } }));
  if (!targetExists) throw new Error("The reported content does not exist or is not visible to you");
  await db.report.upsert({
    where: { reporterId_targetType_targetId: { reporterId: user.id, targetType, targetId } },
    update: { reason, details, status: "OPEN", reviewedAt: null, reviewedById: null },
    create: { reporterId: user.id, targetType, targetId, reason, details },
  });
  revalidatePath(safeReturnPath(formData.get("returnTo")));
}

export async function markNotificationsRead() {
  const user = await requireUser();
  await db.notification.updateMany({ where: { recipientId: user.id, readAt: null }, data: { readAt: new Date() } });
  revalidatePath("/notifications");
}

export async function moderateReport(formData: FormData) {
  const moderator = await requireModerator();
  const reportId = z.string().cuid().parse(formData.get("reportId"));
  const decision = z.enum(["RESOLVED", "DISMISSED"]).parse(formData.get("decision"));
  const resolution = z.string().trim().min(2).max(500).parse(formData.get("resolution"));
  const report = await db.report.findUnique({ where: { id: reportId } });
  if (!report) throw new Error("Report not found");
  await db.$transaction([
    db.report.update({ where: { id: reportId }, data: { status: decision, resolution, reviewedAt: new Date(), reviewedById: moderator.id } }),
    db.moderationAction.create({
      data: {
        type: decision === "RESOLVED" ? "RESOLVE_REPORT" : "DISMISS_REPORT",
        moderatorId: moderator.id,
        targetType: report.targetType,
        targetId: report.targetId,
        reason: resolution,
      },
    }),
  ]);
  revalidatePath("/moderation");
}

export async function toggleThreadLock(formData: FormData) {
  const moderator = await requireModerator();
  const threadId = z.string().cuid().parse(formData.get("threadId"));
  const thread = await db.thread.findUnique({ where: { id: threadId } });
  if (!thread) throw new Error("Thread not found");
  const lock = !thread.isLocked;
  await db.$transaction([
    db.thread.update({ where: { id: threadId }, data: { isLocked: lock } }),
    db.moderationAction.create({ data: { type: lock ? "LOCK" : "UNLOCK", moderatorId: moderator.id, targetType: "THREAD", targetId: threadId, reason: lock ? "Thread locked" : "Thread unlocked" } }),
  ]);
  revalidatePath(`/t/${thread.slug}`);
}

export async function setContentVisibility(formData: FormData) {
  const moderator = await requireModerator();
  const targetType = z.enum(["THREAD", "REPLY"]).parse(formData.get("targetType"));
  const targetId = z.string().cuid().parse(formData.get("targetId"));
  const hide = formData.get("hide") === "true";
  const reason = z.string().trim().min(2).max(500).parse(formData.get("reason") ?? "Moderation action");
  if (targetType === "THREAD") await db.thread.update({ where: { id: targetId }, data: { status: hide ? "HIDDEN" : "PUBLISHED" } });
  else await db.reply.update({ where: { id: targetId }, data: { status: hide ? "HIDDEN" : "PUBLISHED" } });
  await db.moderationAction.create({ data: { type: hide ? "HIDE" : "RESTORE", moderatorId: moderator.id, targetType, targetId, reason } });
  revalidatePath("/moderation");
}

export async function suspendMember(formData: FormData) {
  const moderator = await requireModerator();
  const userId = z.string().cuid().parse(formData.get("userId"));
  const days = z.coerce.number().int().min(1).max(365).parse(formData.get("days") ?? 7);
  const reason = z.string().trim().min(3).max(500).parse(formData.get("reason"));
  const target = await db.user.findUnique({ where: { id: userId } });
  if (!target) throw new Error("This member cannot be suspended");
  const targetRole = await getVerifiedUserRole(target);
  if (!targetRole || targetRole === "ADMIN") throw new Error("This member cannot be suspended");
  const until = new Date(Date.now() + days * 86_400_000);
  await db.$transaction([
    db.user.update({ where: { id: userId }, data: { status: "SUSPENDED", suspendedUntil: until, suspensionReason: reason } }),
    db.moderationAction.create({ data: { type: "SUSPEND", moderatorId: moderator.id, userId, targetType: "USER", targetId: userId, reason, metadata: { until: until.toISOString() } } }),
    db.notification.create({ data: { type: NotificationType.MODERATION, recipientId: userId, actorId: moderator.id } }),
  ]);
  revalidatePath("/moderation");
}
