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
  blockMember, createReply, createThread, moderateReport, reportContent, sendMessage,
  setContentVisibility, startConversation, suspendMember, toggleBookmark, toggleFollow,
  toggleThreadLock, toggleThreadVote,
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
  it("persists a thread, normalized tags, reply, mentions, votes, bookmark, and follow", async () => {
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
    await toggleThreadVote(form({ threadId: thread.id, returnTo: `/t/${thread.slug}` }));
    await toggleBookmark(form({ threadId: thread.id, returnTo: `/t/${thread.slug}` }));
    await toggleFollow(form({ userId: author.id, returnTo: `/members/${author.id}` }));
    expect(await db.reply.count({ where: { threadId: thread.id } })).toBe(1);
    expect(await db.threadVote.count({ where: { threadId: thread.id } })).toBe(1);
    expect(await db.bookmark.count({ where: { threadId: thread.id } })).toBe(1);
    expect(await db.follow.count({ where: { followingId: author.id } })).toBe(1);
    expect(await db.notification.count({ where: { recipientId: author.id } })).toBe(3);
  });

  it("persists messaging, visibility-scoped reports, and blocks future delivery", async () => {
    const [one, two, outsider] = await Promise.all([createTestUser(), createTestUser(), createTestUser()]);
    authState.user = one;
    await expect(startConversation(form({ userId: two.id }))).rejects.toThrow("redirect:/messages/");
    const conversation = await db.conversation.findFirstOrThrow();
    await sendMessage(form({ conversationId: conversation.id, body: "Private hello" }));
    const message = await db.message.findFirstOrThrow();
    expect(await db.notification.count({ where: { recipientId: two.id, type: "MESSAGE" } })).toBe(1);

    authState.user = outsider;
    await expect(reportContent(form({ targetType: "MESSAGE", targetId: message.id, reason: "Spam" }))).rejects.toThrow("not visible");
    authState.user = two;
    await reportContent(form({ targetType: "MESSAGE", targetId: message.id, reason: "Spam" }));
    expect(await db.report.count()).toBe(1);
    await blockMember(form({ userId: one.id }));
    await expect(sendMessage(form({ conversationId: conversation.id, body: "Blocked reply" }))).rejects.toThrow("unavailable");
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

  it("enforces compound uniqueness and cascade deletion", async () => {
    const [author, voter] = await Promise.all([createTestUser(), createTestUser()]);
    const category = await createTestCategory();
    const thread = await createTestThread(author.id, category.id);
    await db.reply.create({ data: { threadId: thread.id, authorId: author.id, body: "Cascade reply" } });
    await db.threadVote.create({ data: { threadId: thread.id, userId: voter.id } });
    await expect(db.threadVote.create({ data: { threadId: thread.id, userId: voter.id } })).rejects.toThrow();
    await db.thread.delete({ where: { id: thread.id } });
    expect(await db.reply.count()).toBe(0);
    expect(await db.threadVote.count()).toBe(0);
  });
});
