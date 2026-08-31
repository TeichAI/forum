"use server";

import { Prisma, ReportTargetType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getVerifiedUserRole, requireModerator, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { claimAttachments } from "@/lib/attachments";
import { canModerateRole } from "@/lib/moderation";
import {
  consumeUserMutation,
  RATE_LIMIT_POLICIES,
  rateLimitedActionState,
  type RateLimitPolicy,
} from "@/lib/rate-limit";
import { canComment, canStartDiscussion } from "@/lib/space-posting-permissions";
import { parseMentions, safeReturnPath, threadSlug } from "@/lib/utils";
import { inaccessible, publicReplyWhere, publicThreadWhere } from "@/lib/access";
import { resolveCanonicalTags } from "@/lib/tags";
import { withSerializableRetry } from "@/lib/transactions";
import { getPollSnapshot } from "@/lib/poll-data";
import { canAccessPollThread } from "@/lib/poll-access";
import { pollDurationMilliseconds, type PollDuration, type PollSnapshot } from "@/lib/polls";

const titleSchema = z.string().trim().min(5).max(160);
const bodySchema = z.string().trim().min(2).max(50_000);
const reactionSchema = z.enum(["UPVOTE", "DISLIKE"]);
const pollDurationSchema = z.enum(["1h", "1d", "3d", "7d", "14d", "30d"]);

export type PollActionState =
  | { status: "idle"; message?: undefined; poll?: undefined }
  | { status: "success"; message: string; poll: PollSnapshot }
  | { status: "error" | "rate_limited"; message: string; poll?: undefined };

function parsePollInput(formData: FormData) {
  if (formData.get("hasPoll") !== "true") return null;
  const question = z.string().trim().min(1, "Enter a poll question.").max(240).parse(formData.get("pollQuestion"));
  const duration = pollDurationSchema.parse(formData.get("pollDuration")) as PollDuration;
  const options = formData.getAll("pollOptions").map((option) => z.string().trim().max(120).parse(option)).filter(Boolean);
  if (options.length < 2 || options.length > 10) throw new Error("Polls require between 2 and 10 choices.");
  if (new Set(options.map((option) => option.toLowerCase())).size !== options.length) {
    throw new Error("Poll choices must be unique.");
  }
  return { question, duration, options };
}

async function mutationLimit(
  user: { clerkId: string; role: string },
  policy?: RateLimitPolicy,
  additional: RateLimitPolicy[] = [],
) {
  const result = await consumeUserMutation(user, policy, additional);
  return result.allowed ? null : rateLimitedActionState(result);
}

type NotificationClient = Pick<Prisma.TransactionClient, "user" | "notification">;

async function notifyMentions(body: string, actorId: string, data: { threadId?: string; replyId?: string }, client: NotificationClient = db) {
  const usernames = parseMentions(body);
  if (!usernames.length) return;
  const users = await client.user.findMany({ where: { username: { in: usernames }, status: "ACTIVE", id: { not: actorId } }, select: { id: true } });
  if (users.length) {
    await client.notification.createMany({
      data: users.map((user) => ({ type: "MENTION", recipientId: user.id, actorId, ...data })),
    });
  }
}

export async function createThread(formData: FormData) {
  const user = await requireUser();
  const limited = await mutationLimit(user, RATE_LIMIT_POLICIES.thread);
  if (limited) return limited;
  const title = titleSchema.parse(formData.get("title"));
  const body = bodySchema.parse(formData.get("body"));
  const categoryId = z.string().cuid().parse(formData.get("categoryId"));
  const rawTags = z.string().max(180).catch("").parse(formData.get("tags") ?? "");
  const tags = rawTags.split(",");
  const pollInput = parsePollInput(formData);

  if (pollInput) {
    const verifiedRole = await getVerifiedUserRole(user);
    if (verifiedRole !== "MODERATOR" && verifiedRole !== "ADMIN") {
      throw new Error("Only staff can attach polls to discussions.");
    }
  }

  const category = await db.category.findUnique({ where: { id: categoryId }, select: { id: true, postingPolicy: true, archivedAt: true } });
  if (!category || category.archivedAt) throw new Error("Category not found");
  if (!canStartDiscussion(user.role, category.postingPolicy)) {
    throw new Error("You do not have permission to start a discussion in this space");
  }

  const thread = await withSerializableRetry(async (tx) => {
    const canonicalTags = await resolveCanonicalTags(tx, tags);
    const created = await tx.thread.create({
      data: {
        title,
        body,
        slug: threadSlug(title),
        authorId: user.id,
        categoryId,
        tags: { create: canonicalTags.map((tag) => ({ tagId: tag.id })) },
        poll: pollInput ? {
          create: {
            question: pollInput.question,
            expiresAt: new Date(Date.now() + pollDurationMilliseconds(pollInput.duration)),
            options: { create: pollInput.options.map((text, position) => ({ text, position })) },
          },
        } : undefined,
      },
    });
    await claimAttachments(body, user.id, "THREAD", created.id, undefined, tx);
    await notifyMentions(body, user.id, { threadId: created.id }, tx);
    return created;
  }, { retryUnique: true });
  redirect(`/t/${thread.slug}`);
}

export async function voteInPoll(_previousState: PollActionState, formData: FormData): Promise<PollActionState> {
  const user = await requireUser();
  const limited = await mutationLimit(user, RATE_LIMIT_POLICIES.interaction, [RATE_LIMIT_POLICIES.pollVote]);
  if (limited) return limited;
  const parsed = z.object({
    pollId: z.string().cuid(),
    optionId: z.string().cuid(),
  }).safeParse({ pollId: formData.get("pollId"), optionId: formData.get("optionId") });
  if (!parsed.success) return { status: "error", message: "Choose a valid poll option." };

  let threadPath: string | null = null;
  const result = await withSerializableRetry(async (tx): Promise<PollActionState> => {
    const poll = await tx.poll.findUnique({
      where: { id: parsed.data.pollId },
      select: {
        id: true,
        expiresAt: true,
        thread: {
          select: {
            slug: true,
            status: true,
            author: { select: { status: true } },
            category: { select: { archivedAt: true } },
          },
        },
        options: { where: { id: parsed.data.optionId }, select: { id: true } },
      },
    });
    if (!poll || !await canAccessPollThread(poll.thread, user)) return { status: "error", message: "This poll is unavailable." };
    if (poll.expiresAt <= new Date()) return { status: "error", message: "This poll is closed." };
    if (!poll.options.length) return { status: "error", message: "Choose a valid poll option." };

    await tx.pollVote.upsert({
      where: { pollId_userId: { pollId: poll.id, userId: user.id } },
      update: { optionId: parsed.data.optionId },
      create: { pollId: poll.id, optionId: parsed.data.optionId, userId: user.id },
    });
    const snapshot = await getPollSnapshot(poll.id, user.id, tx);
    if (!snapshot) return { status: "error", message: "This poll is unavailable." };
    threadPath = `/t/${poll.thread.slug}`;
    return { status: "success", message: "Vote recorded.", poll: snapshot };
  });
  if (result.status === "success" && threadPath) revalidatePath(threadPath);
  return result;
}

export async function createReply(formData: FormData) {
  const user = await requireUser();
  const limited = await mutationLimit(user, RATE_LIMIT_POLICIES.reply);
  if (limited) return limited;
  const threadId = z.string().cuid().parse(formData.get("threadId"));
  const parentReplyId = z.preprocess(
    (value) => value === null || value === "" ? undefined : value,
    z.string().cuid().optional(),
  ).parse(formData.get("parentReplyId"));
  const body = bodySchema.parse(formData.get("body"));
  const thread = await db.thread.findUnique({
    where: { id: threadId },
    select: {
      id: true,
      slug: true,
      authorId: true,
      isLocked: true,
      status: true,
      author: { select: { status: true } },
      category: { select: { postingPolicy: true, archivedAt: true } },
    },
  });
  if (!thread || thread.status !== "PUBLISHED" || thread.author.status !== "ACTIVE") throw new Error("Thread not found");
  if (thread.isLocked) throw new Error("This thread is locked");
  if (thread.category.archivedAt) throw new Error("Thread not found");
  if (!canComment(user.role, thread.category.postingPolicy)) {
    throw new Error("You do not have permission to comment in this space");
  }

  const parentReply = parentReplyId ? await db.reply.findUnique({
    where: { id: parentReplyId },
    select: { id: true, authorId: true, threadId: true, status: true, author: { select: { status: true } } },
  }) : null;
  if (parentReplyId && (!parentReply || parentReply.status !== "PUBLISHED" || parentReply.author.status !== "ACTIVE" || parentReply.threadId !== threadId)) {
    throw new Error("Parent reply not found in this thread");
  }

  const reply = await db.$transaction(async (tx) => {
    const created = await tx.reply.create({ data: { body, threadId, authorId: user.id, ...(parentReplyId ? { parentReplyId } : {}) } });
    await tx.thread.update({ where: { id: threadId }, data: { bumpedAt: new Date() } });
    const recipientId = parentReply?.authorId ?? thread.authorId;
    if (recipientId !== user.id) {
      await tx.notification.create({ data: { type: "REPLY", recipientId, actorId: user.id, threadId, replyId: created.id } });
    }
    await claimAttachments(body, user.id, "REPLY", created.id, undefined, tx);
    await notifyMentions(body, user.id, { threadId, replyId: created.id }, tx);
    return created;
  });
  revalidatePath(`/t/${thread.slug}`);
  return { status: "success" as const, replyId: reply.id };
}

export async function toggleThreadReaction(formData: FormData) {
  const user = await requireUser();
  const limited = await mutationLimit(user, RATE_LIMIT_POLICIES.interaction);
  if (limited) return limited;
  const threadId = z.string().cuid().parse(formData.get("threadId"));
  const reaction = reactionSchema.parse(formData.get("reaction"));
  const returnTo = safeReturnPath(formData.get("returnTo"));
  const thread = await db.thread.findFirst({ where: { id: threadId, ...publicThreadWhere }, select: { authorId: true, status: true } });
  if (!thread || thread.status !== "PUBLISHED") throw inaccessible("Thread not found");
  await db.$transaction(async (tx) => {
    if (reaction === "UPVOTE") {
      const existing = await tx.threadUpvote.findUnique({ where: { userId_threadId: { userId: user.id, threadId } } });
      if (existing) {
        await tx.threadUpvote.delete({ where: { userId_threadId: { userId: user.id, threadId } } });
      } else {
        await tx.threadDislike.deleteMany({ where: { userId: user.id, threadId } });
        await tx.threadUpvote.create({ data: { userId: user.id, threadId } });
        if (thread.authorId !== user.id) {
          await tx.notification.create({ data: { type: "UPVOTE", recipientId: thread.authorId, actorId: user.id, threadId } });
        }
      }
    } else {
      const existing = await tx.threadDislike.findUnique({ where: { userId_threadId: { userId: user.id, threadId } } });
      if (existing) {
        await tx.threadDislike.delete({ where: { userId_threadId: { userId: user.id, threadId } } });
      } else {
        await tx.threadUpvote.deleteMany({ where: { userId: user.id, threadId } });
        await tx.threadDislike.create({ data: { userId: user.id, threadId } });
      }
    }
  });
  revalidatePath(returnTo);
}

export async function toggleReplyReaction(formData: FormData) {
  const user = await requireUser();
  const limited = await mutationLimit(user, RATE_LIMIT_POLICIES.interaction);
  if (limited) return limited;
  const replyId = z.string().cuid().parse(formData.get("replyId"));
  const reaction = reactionSchema.parse(formData.get("reaction"));
  const returnTo = safeReturnPath(formData.get("returnTo"));
  const reply = await db.reply.findFirst({ where: { id: replyId, ...publicReplyWhere }, select: { authorId: true, threadId: true, status: true } });
  if (!reply || reply.status !== "PUBLISHED") throw inaccessible("Reply not found");
  await db.$transaction(async (tx) => {
    if (reaction === "UPVOTE") {
      const existing = await tx.replyUpvote.findUnique({ where: { userId_replyId: { userId: user.id, replyId } } });
      if (existing) {
        await tx.replyUpvote.delete({ where: { userId_replyId: { userId: user.id, replyId } } });
      } else {
        await tx.replyDislike.deleteMany({ where: { userId: user.id, replyId } });
        await tx.replyUpvote.create({ data: { userId: user.id, replyId } });
        if (reply.authorId !== user.id) {
          await tx.notification.create({ data: { type: "UPVOTE", recipientId: reply.authorId, actorId: user.id, replyId, threadId: reply.threadId } });
        }
      }
    } else {
      const existing = await tx.replyDislike.findUnique({ where: { userId_replyId: { userId: user.id, replyId } } });
      if (existing) {
        await tx.replyDislike.delete({ where: { userId_replyId: { userId: user.id, replyId } } });
      } else {
        await tx.replyUpvote.deleteMany({ where: { userId: user.id, replyId } });
        await tx.replyDislike.create({ data: { userId: user.id, replyId } });
      }
    }
  });
  revalidatePath(returnTo);
}

export async function toggleBookmark(formData: FormData) {
  const user = await requireUser();
  const limited = await mutationLimit(user, RATE_LIMIT_POLICIES.interaction);
  if (limited) return limited;
  const threadId = z.string().cuid().parse(formData.get("threadId"));
  const returnTo = safeReturnPath(formData.get("returnTo"));
  const thread = await db.thread.findFirst({ where: { id: threadId, ...publicThreadWhere }, select: { id: true } });
  if (!thread) throw inaccessible("Thread not found");
  const existing = await db.bookmark.findUnique({ where: { userId_threadId: { userId: user.id, threadId } } });
  if (existing) await db.bookmark.delete({ where: { userId_threadId: { userId: user.id, threadId } } });
  else await db.bookmark.create({ data: { userId: user.id, threadId } });
  revalidatePath(returnTo);
}

export async function toggleFollow(formData: FormData) {
  const user = await requireUser();
  const limited = await mutationLimit(user, RATE_LIMIT_POLICIES.interaction);
  if (limited) return limited;
  const followingId = z.string().cuid().parse(formData.get("userId"));
  const returnTo = safeReturnPath(formData.get("returnTo"));
  if (followingId === user.id) throw new Error("You cannot follow yourself");
  const target = await db.user.findFirst({ where: { id: followingId, status: "ACTIVE" }, select: { id: true } });
  if (!target) throw inaccessible("Member not found");
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
  const limited = await mutationLimit(user);
  if (limited) return limited;
  const threadId = z.string().cuid().parse(formData.get("threadId"));
  const title = titleSchema.parse(formData.get("title"));
  const body = bodySchema.parse(formData.get("body"));
  const thread = await db.thread.findUnique({ where: { id: threadId } });
  if (!thread || thread.authorId !== user.id) throw new Error("You cannot edit this discussion");
  if (thread.isLocked) throw new Error("This thread is locked");
  await db.$transaction(async (tx) => {
    await tx.thread.update({ where: { id: threadId }, data: { title, body, editedAt: new Date() } });
    await claimAttachments(body, user.id, "THREAD", threadId, undefined, tx);
  });
  revalidatePath(`/t/${thread.slug}`);
  redirect(`/t/${thread.slug}`);
}

export async function deleteThread(formData: FormData) {
  const user = await requireUser();
  const limited = await mutationLimit(user);
  if (limited) return limited;
  const threadId = z.string().cuid().parse(formData.get("threadId"));
  const thread = await db.thread.findUnique({ where: { id: threadId } });
  if (!thread || thread.authorId !== user.id) throw new Error("You cannot delete this discussion");
  if (thread.isLocked) throw new Error("This thread is locked");
  await db.thread.update({ where: { id: threadId }, data: { status: "DELETED", deletedAt: new Date() } });
  revalidatePath("/");
  redirect("/");
}

export async function updateReply(formData: FormData) {
  const user = await requireUser();
  const limited = await mutationLimit(user);
  if (limited) return limited;
  const replyId = z.string().cuid().parse(formData.get("replyId"));
  const body = bodySchema.parse(formData.get("body"));
  const reply = await db.reply.findUnique({ where: { id: replyId }, include: { thread: { select: { slug: true, isLocked: true } } } });
  if (!reply || reply.authorId !== user.id) throw new Error("You cannot edit this reply");
  if (reply.thread.isLocked) throw new Error("This thread is locked");
  await db.$transaction(async (tx) => {
    await tx.reply.update({ where: { id: replyId }, data: { body, editedAt: new Date() } });
    await claimAttachments(body, user.id, "REPLY", replyId, undefined, tx);
  });
  revalidatePath(`/t/${reply.thread.slug}`);
}

export async function deleteReply(formData: FormData) {
  const user = await requireUser();
  const limited = await mutationLimit(user);
  if (limited) return limited;
  const replyId = z.string().cuid().parse(formData.get("replyId"));
  const reply = await db.reply.findUnique({ where: { id: replyId }, include: { thread: { select: { slug: true, isLocked: true } } } });
  if (!reply || reply.authorId !== user.id) throw new Error("You cannot delete this reply");
  if (reply.thread.isLocked) throw new Error("This thread is locked");
  await db.reply.update({ where: { id: replyId }, data: { status: "DELETED", deletedAt: new Date() } });
  revalidatePath(`/t/${reply.thread.slug}`);
}

export async function blockMember(formData: FormData) {
  const user = await requireUser();
  const limited = await mutationLimit(user, RATE_LIMIT_POLICIES.interaction);
  if (limited) return limited;
  const blockedId = z.string().cuid().parse(formData.get("userId"));
  if (blockedId === user.id) throw new Error("You cannot block yourself");
  if (!await db.user.findFirst({ where: { id: blockedId, status: "ACTIVE" }, select: { id: true } })) throw inaccessible("Member not found");
  await db.block.upsert({ where: { blockerId_blockedId: { blockerId: user.id, blockedId } }, update: {}, create: { blockerId: user.id, blockedId } });
  revalidatePath("/mail");
}

export async function reportContent(formData: FormData) {
  const user = await requireUser();
  const limited = await mutationLimit(user, RATE_LIMIT_POLICIES.report);
  if (limited) return limited;
  const targetType = z.enum([ReportTargetType.THREAD, ReportTargetType.REPLY, ReportTargetType.USER, ReportTargetType.MAIL_ENTRY]).parse(formData.get("targetType"));
  const targetId = z.string().cuid().parse(formData.get("targetId"));
  const reason = z.string().trim().min(3).max(80).parse(formData.get("reason"));
  const details = z.string().trim().max(1000).parse(formData.get("details") ?? "");
  const targetExists = targetType === "THREAD"
    ? Boolean(await db.thread.findFirst({ where: { id: targetId, ...publicThreadWhere }, select: { id: true } }))
    : targetType === "REPLY"
      ? Boolean(await db.reply.findFirst({ where: { id: targetId, ...publicReplyWhere }, select: { id: true } }))
      : targetType === "USER"
        ? Boolean(await db.user.findFirst({ where: { id: targetId, status: "ACTIVE" }, select: { id: true } }))
        : Boolean(await db.mailEntry.findUnique({ where: { id: targetId, thread: { participants: { some: { userId: user.id, removedAt: null } } } }, select: { id: true } }));
  if (!targetExists) throw new Error("The reported content does not exist or is not visible to you");
  await withSerializableRetry(async (tx) => {
    const reportCase = await tx.moderationCase.findFirst({
      where: { targetType, targetId, status: { in: ["OPEN", "IN_REVIEW"] } },
      orderBy: { createdAt: "asc" },
    }) ?? await tx.moderationCase.create({ data: { targetType, targetId } });
    await tx.report.upsert({
      where: { reporterId_targetType_targetId: { reporterId: user.id, targetType, targetId } },
      update: { reason, details, caseId: reportCase.id, createdAt: new Date() },
      create: { reporterId: user.id, targetType, targetId, reason, details, caseId: reportCase.id },
    });
  }, { retryUnique: true });
  revalidatePath(safeReturnPath(formData.get("returnTo")));
}

export async function markNotificationsRead() {
  const user = await requireUser();
  const limited = await mutationLimit(user, RATE_LIMIT_POLICIES.interaction);
  if (limited) return limited;
  await db.notification.updateMany({ where: { recipientId: user.id, readAt: null }, data: { readAt: new Date() } });
  revalidatePath("/notifications");
}

export async function toggleThreadLock(formData: FormData) {
  const moderator = await requireModerator();
  const limited = await mutationLimit(moderator);
  if (limited) return limited;
  const threadId = z.string().cuid().parse(formData.get("threadId"));
  const thread = await db.thread.findUnique({ where: { id: threadId }, include: { author: true } });
  if (!thread) throw new Error("Thread not found");
  const authorRole = await getVerifiedUserRole(thread.author);
  if (!authorRole || !canModerateRole(moderator.role, authorRole)) throw new Error("This content is protected by the role hierarchy");
  const lock = !thread.isLocked;
  await db.$transaction(async (tx) => {
    await tx.thread.update({ where: { id: threadId }, data: { isLocked: lock } });
    const action = await tx.moderationAction.create({ data: { type: lock ? "LOCK" : "UNLOCK", moderatorId: moderator.id, userId: thread.authorId, targetType: "THREAD", targetId: threadId, reason: lock ? "Thread locked" : "Thread unlocked" } });
    await tx.notification.create({ data: { type: "MODERATION", recipientId: thread.authorId, actorId: moderator.id, threadId, moderationActionId: action.id } });
  });
  revalidatePath(`/t/${thread.slug}`);
}
