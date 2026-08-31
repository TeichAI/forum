import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@prisma/client";

const authState = vi.hoisted(() => ({ user: null as User | null, moderator: null as User | null, uploads: false }));
vi.mock("@/lib/auth", () => ({
  getVerifiedUserRole: vi.fn(async (user: User) => user.role),
  requireUser: vi.fn(async () => authState.user),
  requireModerator: vi.fn(async () => authState.moderator ?? authState.user),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn((path: string) => { throw new Error(`redirect:${path}`); }) }));
vi.mock("@/lib/upload-capability", () => ({ uploadsEnabled: vi.fn(() => authState.uploads) }));

import {
  createReply, createThread, deleteReply, toggleBookmark, toggleFollow,
  reportContent, toggleReplyReaction, toggleThreadReaction,
  voteInPoll,
} from "./forum";
import { db } from "@/lib/db";
import { createTestCategory, createTestThread, createTestUser } from "@/test/integration-factories";

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

function pollForm(values: Record<string, string>, options: string[]) {
  const data = form(values);
  for (const option of options) data.append("pollOptions", option);
  return data;
}

beforeEach(() => { authState.user = null; authState.moderator = null; authState.uploads = false; });

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

  it("creates a staff poll atomically, keeps one changeable vote per user, expires, and cascades", async () => {
    const [staff, member] = await Promise.all([
      createTestUser({ role: "MODERATOR" }),
      createTestUser({ role: "MEMBER" }),
    ]);
    const category = await createTestCategory();
    const pollData = () => pollForm({
      title: "Database staff poll", body: "Choose below", categoryId: category.id,
      hasPoll: "true", pollQuestion: "Which database?", pollDuration: "1d",
    }, ["PostgreSQL", "SQLite", "MySQL"]);

    authState.user = member;
    await expect(createThread(pollData())).rejects.toThrow("Only staff");
    expect(await db.thread.count({ where: { title: "Database staff poll" } })).toBe(0);

    authState.user = staff;
    await expect(createThread(pollData())).rejects.toThrow("redirect:/t/");
    const thread = await db.thread.findFirstOrThrow({
      where: { title: "Database staff poll" },
      include: { poll: { include: { options: { orderBy: { position: "asc" } } } } },
    });
    expect(thread.poll).toEqual(expect.objectContaining({ question: "Which database?" }));
    expect(thread.poll?.options.map(({ text, position }) => ({ text, position }))).toEqual([
      { text: "PostgreSQL", position: 0 },
      { text: "SQLite", position: 1 },
      { text: "MySQL", position: 2 },
    ]);
    const [first, second] = thread.poll!.options;

    authState.user = member;
    await expect(voteInPoll({ status: "idle" }, form({ pollId: thread.poll!.id, optionId: first!.id }))).resolves.toEqual(expect.objectContaining({ status: "success" }));
    await expect(voteInPoll({ status: "idle" }, form({ pollId: thread.poll!.id, optionId: second!.id }))).resolves.toEqual(expect.objectContaining({ status: "success" }));
    expect(await db.pollVote.findMany({ where: { pollId: thread.poll!.id, userId: member.id } })).toEqual([
      expect.objectContaining({ optionId: second!.id }),
    ]);

    await Promise.all([
      voteInPoll({ status: "idle" }, form({ pollId: thread.poll!.id, optionId: first!.id })),
      voteInPoll({ status: "idle" }, form({ pollId: thread.poll!.id, optionId: second!.id })),
    ]);
    expect(await db.pollVote.count({ where: { pollId: thread.poll!.id, userId: member.id } })).toBe(1);

    await db.poll.update({ where: { id: thread.poll!.id }, data: { expiresAt: new Date(Date.now() - 1) } });
    await expect(voteInPoll({ status: "idle" }, form({ pollId: thread.poll!.id, optionId: first!.id }))).resolves.toEqual({ status: "error", message: "This poll is closed." });
    expect(await db.pollVote.count({ where: { pollId: thread.poll!.id } })).toBe(1);

    await db.thread.delete({ where: { id: thread.id } });
    expect(await db.poll.count({ where: { id: thread.poll!.id } })).toBe(0);
    expect(await db.pollOption.count({ where: { pollId: thread.poll!.id } })).toBe(0);
    expect(await db.pollVote.count({ where: { pollId: thread.poll!.id } })).toBe(0);
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

  it("groups simultaneous reports for the same target into one active case", async () => {
    const [author, firstReporter, secondReporter] = await Promise.all([createTestUser(), createTestUser(), createTestUser()]);
    const category = await createTestCategory();
    const thread = await createTestThread(author.id, category.id);

    authState.user = firstReporter;
    const first = reportContent(form({ targetType: "THREAD", targetId: thread.id, reason: "Spam" }));
    authState.user = secondReporter;
    const second = reportContent(form({ targetType: "THREAD", targetId: thread.id, reason: "Harassment" }));
    await Promise.all([first, second]);

    const cases = await db.moderationCase.findMany({ where: { targetType: "THREAD", targetId: thread.id } });
    expect(cases).toHaveLength(1);
    expect(await db.report.count({ where: { caseId: cases[0]!.id } })).toBe(2);
  });

  it("rolls back a new discussion when attachment claiming fails", async () => {
    const author = await createTestUser();
    const category = await createTestCategory();
    const attachment = await db.attachment.create({ data: { key: "rollback-image", url: "https://utfs.io/f/rollback-image", name: "pond.png", size: 42, userId: author.id } });
    authState.user = author;
    authState.uploads = true;
    await db.$executeRawUnsafe(`CREATE FUNCTION reject_attachment_claim() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'test attachment failure'; END; $$ LANGUAGE plpgsql`);
    await db.$executeRawUnsafe(`CREATE TRIGGER reject_attachment_claim BEFORE UPDATE ON "Attachment" FOR EACH ROW EXECUTE FUNCTION reject_attachment_claim()`);
    try {
      await expect(createThread(form({ title: "Atomic attachment claim", body: `Inline ![pond](${attachment.url})`, categoryId: category.id, tags: "rollback-tag" }))).rejects.toThrow();
    } finally {
      await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS reject_attachment_claim ON "Attachment"`);
      await db.$executeRawUnsafe(`DROP FUNCTION IF EXISTS reject_attachment_claim()`);
    }

    expect(await db.thread.count({ where: { title: "Atomic attachment claim" } })).toBe(0);
    expect(await db.tag.count({ where: { slug: "rollback-tag" } })).toBe(0);
    expect(await db.attachment.findUniqueOrThrow({ where: { id: attachment.id } })).toEqual(expect.objectContaining({ context: "DRAFT", targetId: null }));
  });

  it("rolls back a new discussion when mention notification creation fails", async () => {
    const [author, mentioned] = await Promise.all([createTestUser(), createTestUser({ username: "atomic_mention" })]);
    const category = await createTestCategory();
    authState.user = author;
    await db.$executeRawUnsafe(`CREATE FUNCTION reject_mention_notice() RETURNS trigger AS $$ BEGIN IF NEW.type = 'MENTION' THEN RAISE EXCEPTION 'test mention failure'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`);
    await db.$executeRawUnsafe(`CREATE TRIGGER reject_mention_notice BEFORE INSERT ON "Notification" FOR EACH ROW EXECUTE FUNCTION reject_mention_notice()`);
    try {
      await expect(createThread(form({ title: "Atomic mention notification", body: `Hello @${mentioned.username}`, categoryId: category.id }))).rejects.toThrow();
    } finally {
      await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS reject_mention_notice ON "Notification"`);
      await db.$executeRawUnsafe(`DROP FUNCTION IF EXISTS reject_mention_notice()`);
    }
    expect(await db.thread.count({ where: { title: "Atomic mention notification" } })).toBe(0);
  });
});
