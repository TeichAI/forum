import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@prisma/client";

const authState = vi.hoisted(() => ({ user: null as User | null, moderator: null as User | null }));
vi.mock("@/lib/auth", () => ({
  getVerifiedUserRole: vi.fn(async (user: User) => user.role),
  requireUser: vi.fn(async () => authState.user),
  requireModerator: vi.fn(async () => authState.moderator ?? authState.user),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn((path: string) => { throw new Error(`redirect:${path}`); }) }));
vi.mock("@/lib/upload-capability", () => ({ uploadsEnabled: vi.fn(() => false) }));

import {
  createReply, createThread, deleteReply, moderateReport, reportContent,
  setContentVisibility, suspendMember, toggleBookmark, toggleFollow,
  toggleReplyReaction, toggleThreadLock, toggleThreadReaction,
} from "./forum";
import { db } from "@/lib/db";
import { createTestCategory, createTestThread, createTestUser } from "@/test/integration-factories";

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

beforeEach(() => { authState.user = null; authState.moderator = null; });

describe("forum actions against PostgreSQL", () => {
  it("applies current space policies to existing threads and treats moderators like members", async () => {
    const [member, moderator, admin] = await Promise.all([
      createTestUser({ role: "MEMBER" }),
      createTestUser({ role: "MODERATOR" }),
      createTestUser({ role: "ADMIN" }),
    ]);
    const category = await createTestCategory({ postingPolicy: "OPEN" });
    const existingThread = await createTestThread(member.id, category.id);

    authState.user = member;
    await createReply(form({ threadId: existingThread.id, body: "Open member reply" }));

    await db.category.update({ where: { id: category.id }, data: { postingPolicy: "ANNOUNCEMENTS" } });
    await expect(createThread(form({
      title: "Member announcement attempt",
      body: "Members cannot start announcements",
      categoryId: category.id,
    }))).rejects.toThrow("permission");
    await createReply(form({ threadId: existingThread.id, body: "Announcements still accept member replies" }));

    authState.user = moderator;
    await expect(createThread(form({
      title: "Moderator announcement attempt",
      body: "Moderators follow member posting rules",
      categoryId: category.id,
    }))).rejects.toThrow("permission");
    await createReply(form({ threadId: existingThread.id, body: "Moderator reply to announcement" }));

    await db.category.update({ where: { id: category.id }, data: { postingPolicy: "ADMIN_ONLY" } });
    await expect(createReply(form({ threadId: existingThread.id, body: "Now denied immediately" }))).rejects.toThrow("permission");

    authState.user = admin;
    await expect(createThread(form({
      title: "Administrator only discussion",
      body: "Admins retain access",
      categoryId: category.id,
    }))).rejects.toThrow("redirect:/t/");
    await createReply(form({ threadId: existingThread.id, body: "Admin reply" }));

    await db.thread.update({ where: { id: existingThread.id }, data: { isLocked: true } });
    await expect(createReply(form({ threadId: existingThread.id, body: "Lock remains absolute" }))).rejects.toThrow("locked");
  });
  it("persists a thread, normalized tags, reply, mentions, upvote, bookmark, and follow", async () => {
    const [author, participant, mentioned] = await Promise.all([
      createTestUser({ username: "author" }), createTestUser({ username: "participant" }), createTestUser({ username: "mentioned" }),
    ]);
    const category = await createTestCategory();
    authState.user = author;
    await expect(createThread(form({
      title: "Database integration thread", body: "Hello @mentioned", categoryId: category.id, tags: "Next JS,next-js,Testing",
    }))).rejects.toThrow("redirect:/t/");
    const thread = await db.thread.findFirstOrThrow({ where: { authorId: author.id }, include: { tags: { include: { tag: true } } } });
    expect(thread.tags.map(({ tag }) => tag.slug).sort()).toEqual(["next-js", "testing"]);
    expect(await db.notification.count({ where: { recipientId: mentioned.id, type: "MENTION" } })).toBe(1);

    authState.user = participant;
    await createReply(form({ threadId: thread.id, body: "Replying to @mentioned" }));
    await toggleThreadReaction(form({ threadId: thread.id, reaction: "UPVOTE", returnTo: `/t/${thread.slug}` }));
    await toggleBookmark(form({ threadId: thread.id, returnTo: `/t/${thread.slug}` }));
    await toggleFollow(form({ userId: author.id, returnTo: `/members/${author.id}` }));
    expect(await db.reply.count({ where: { threadId: thread.id } })).toBe(1);
    expect(await db.threadUpvote.count({ where: { threadId: thread.id } })).toBe(1);
    expect(await db.bookmark.count({ where: { threadId: thread.id } })).toBe(1);
    expect(await db.follow.count({ where: { followingId: author.id } })).toBe(1);
    expect(await db.notification.count({ where: { recipientId: author.id } })).toBe(3);
  });

  it("persists an unlimited-depth branch, notifies direct parents, bumps the thread, and preserves descendants of a removed reply", async () => {
    const [threadAuthor, firstAuthor, thirdAuthor] = await Promise.all([
      createTestUser({ username: "thread_author" }),
      createTestUser({ username: "first_author" }),
      createTestUser({ username: "third_author" }),
    ]);
    const category = await createTestCategory();
    const oldBump = new Date("2026-08-20T12:00:00Z");
    const thread = await createTestThread(threadAuthor.id, category.id, { bumpedAt: oldBump });

    authState.user = firstAuthor;
    const first = await createReply(form({ threadId: thread.id, body: "Level one" }));
    if (!first || first.status !== "success") throw new Error("Expected the first reply to be created");

    authState.user = threadAuthor;
    const second = await createReply(form({ threadId: thread.id, parentReplyId: first.replyId, body: "Level two" }));
    if (!second || second.status !== "success") throw new Error("Expected the second reply to be created");

    authState.user = thirdAuthor;
    const third = await createReply(form({ threadId: thread.id, parentReplyId: second.replyId, body: "Level three" }));
    if (!third || third.status !== "success") throw new Error("Expected the third reply to be created");

    const replies = await db.reply.findMany({ where: { threadId: thread.id }, orderBy: { createdAt: "asc" } });
    expect(replies.map(({ id, parentReplyId }) => ({ id, parentReplyId }))).toEqual([
      { id: first.replyId, parentReplyId: null },
      { id: second.replyId, parentReplyId: first.replyId },
      { id: third.replyId, parentReplyId: second.replyId },
    ]);
    expect((await db.thread.findUniqueOrThrow({ where: { id: thread.id } })).bumpedAt.getTime()).toBeGreaterThan(oldBump.getTime());
    expect(await db.notification.count({ where: { type: "REPLY", recipientId: threadAuthor.id, replyId: first.replyId } })).toBe(1);
    expect(await db.notification.count({ where: { type: "REPLY", recipientId: firstAuthor.id, replyId: second.replyId } })).toBe(1);
    expect(await db.notification.count({ where: { type: "REPLY", recipientId: threadAuthor.id, replyId: third.replyId } })).toBe(1);

    authState.user = firstAuthor;
    await deleteReply(form({ replyId: first.replyId }));
    expect(await db.reply.findUniqueOrThrow({ where: { id: first.replyId } })).toEqual(expect.objectContaining({ status: "DELETED" }));
    expect(await db.reply.count({ where: { id: { in: [second.replyId, third.replyId] }, status: "PUBLISHED" } })).toBe(2);
    expect((await db.reply.findUniqueOrThrow({ where: { id: second.replyId } })).parentReplyId).toBe(first.replyId);

    await db.reply.delete({ where: { id: first.replyId } });
    expect((await db.reply.findUniqueOrThrow({ where: { id: second.replyId } })).parentReplyId).toBeNull();
    expect((await db.reply.findUniqueOrThrow({ where: { id: third.replyId } })).parentReplyId).toBe(second.replyId);
  });

  it("applies moderation transactions and audit records", async () => {
    const [author, reporter, admin] = await Promise.all([
      createTestUser(), createTestUser(), createTestUser({ role: "ADMIN" }),
    ]);
    const category = await createTestCategory();
    const thread = await createTestThread(author.id, category.id);
    authState.user = reporter;
    await reportContent(form({ targetType: "THREAD", targetId: thread.id, reason: "Abuse" }));
    const report = await db.report.findFirstOrThrow();

    authState.moderator = admin;
    await moderateReport(form({ reportId: report.id, decision: "RESOLVED", resolution: "Confirmed report" }));
    await toggleThreadLock(form({ threadId: thread.id }));
    await setContentVisibility(form({ targetType: "THREAD", targetId: thread.id, hide: "true", reason: "Confirmed report" }));
    await suspendMember(form({ userId: author.id, days: "3", reason: "Repeated abuse" }));

    expect(await db.moderationCase.findUnique({ where: { id: report.caseId } })).toEqual(expect.objectContaining({ status: "RESOLVED", assignedToId: admin.id }));
    expect(await db.thread.findUnique({ where: { id: thread.id } })).toEqual(expect.objectContaining({ status: "HIDDEN", isLocked: true }));
    expect(await db.user.findUnique({ where: { id: author.id } })).toEqual(expect.objectContaining({ status: "SUSPENDED" }));
    expect(await db.moderationAction.count({ where: { moderatorId: admin.id } })).toBe(4);
  });

  it("persists unique reactions, switches them exclusively, and cascades thread and reply reactions", async () => {
    const [author, reactor, secondReactor] = await Promise.all([createTestUser(), createTestUser(), createTestUser()]);
    const category = await createTestCategory();
    const thread = await createTestThread(author.id, category.id);
    const reply = await db.reply.create({ data: { threadId: thread.id, authorId: author.id, body: "Cascade reply" } });

    authState.user = reactor;
    await toggleThreadReaction(form({ threadId: thread.id, reaction: "UPVOTE" }));
    await toggleReplyReaction(form({ replyId: reply.id, reaction: "UPVOTE" }));
    expect(await db.threadUpvote.count({ where: { threadId: thread.id, userId: reactor.id } })).toBe(1);
    expect(await db.replyUpvote.count({ where: { replyId: reply.id, userId: reactor.id } })).toBe(1);

    await toggleThreadReaction(form({ threadId: thread.id, reaction: "DISLIKE" }));
    await toggleReplyReaction(form({ replyId: reply.id, reaction: "DISLIKE" }));
    expect(await db.threadUpvote.count({ where: { threadId: thread.id, userId: reactor.id } })).toBe(0);
    expect(await db.replyUpvote.count({ where: { replyId: reply.id, userId: reactor.id } })).toBe(0);
    expect(await db.threadDislike.count({ where: { threadId: thread.id, userId: reactor.id } })).toBe(1);
    expect(await db.replyDislike.count({ where: { replyId: reply.id, userId: reactor.id } })).toBe(1);

    await db.threadUpvote.create({ data: { threadId: thread.id, userId: secondReactor.id } });
    await db.replyUpvote.create({ data: { replyId: reply.id, userId: secondReactor.id } });
    await expect(db.threadUpvote.create({ data: { threadId: thread.id, userId: secondReactor.id } })).rejects.toThrow();
    await expect(db.threadDislike.create({ data: { threadId: thread.id, userId: reactor.id } })).rejects.toThrow();
    await expect(db.replyUpvote.create({ data: { replyId: reply.id, userId: secondReactor.id } })).rejects.toThrow();
    await expect(db.replyDislike.create({ data: { replyId: reply.id, userId: reactor.id } })).rejects.toThrow();

    await db.thread.delete({ where: { id: thread.id } });
    expect(await db.reply.count()).toBe(0);
    expect(await db.threadUpvote.count()).toBe(0);
    expect(await db.threadDislike.count()).toBe(0);
    expect(await db.replyUpvote.count()).toBe(0);
    expect(await db.replyDislike.count()).toBe(0);
  });
});
