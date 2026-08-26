import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createTestCategory, createTestThread, createTestUser } from "@/test/integration-factories";
import { listThreads, searchThreads } from "./queries";
import { listReplyBranches, REPLY_BRANCH_PAGE_SIZE } from "./reply-pagination";

describe("thread queries against PostgreSQL", () => {
  it("filters unpublished and unrelated records and honors pinned/recent ordering", async () => {
    const author = await createTestUser();
    const category = await createTestCategory();
    const otherCategory = await createTestCategory();
    const older = await createTestThread(author.id, category.id, { title: "Older", bumpedAt: new Date("2026-01-01") });
    const newer = await createTestThread(author.id, category.id, { title: "Newer", bumpedAt: new Date("2026-02-01") });
    const pinned = await createTestThread(author.id, category.id, { title: "Pinned", isPinned: true, bumpedAt: new Date("2025-01-01") });
    await createTestThread(author.id, category.id, { title: "Hidden", status: "HIDDEN" });
    await createTestThread(author.id, otherCategory.id, { title: "Elsewhere" });

    const results = await listThreads({ categoryId: category.id });
    expect(results.map((thread) => thread.id)).toEqual([pinned.id, newer.id, older.id]);
  });

  it("orders top discussions by upvote count while ignoring dislikes", async () => {
    const [author, voterOne, voterTwo, dislikerOne, dislikerTwo, dislikerThree] = await Promise.all([
      createTestUser(), createTestUser(), createTestUser(), createTestUser(), createTestUser(), createTestUser(),
    ]);
    const category = await createTestCategory();
    const low = await createTestThread(author.id, category.id, { title: "Low" });
    const high = await createTestThread(author.id, category.id, { title: "High" });
    await db.threadUpvote.createMany({ data: [
      { userId: voterOne.id, threadId: high.id }, { userId: voterTwo.id, threadId: high.id }, { userId: voterOne.id, threadId: low.id },
    ] });
    await db.threadDislike.createMany({ data: [
      { userId: dislikerOne.id, threadId: high.id },
      { userId: dislikerTwo.id, threadId: high.id },
      { userId: dislikerThree.id, threadId: high.id },
    ] });
    const results = await listThreads({ sort: "top" });
    expect(results.map((thread) => thread.id)).toEqual([high.id, low.id]);
  });

  it("searches titles, replies, tags, and usernames while excluding hidden content", async () => {
    const author = await createTestUser({ username: "search_author" });
    const category = await createTestCategory();
    const titleMatch = await createTestThread(author.id, category.id, { title: "Unique Otter Discussion", body: "plain" });
    const replyMatch = await createTestThread(author.id, category.id, { title: "Plain topic", body: "plain" });
    const tagMatch = await createTestThread(author.id, category.id, { title: "Another topic", body: "plain" });
    await db.reply.create({ data: { authorId: author.id, threadId: replyMatch.id, body: "Otter lives here" } });
    const tag = await db.tag.create({ data: { name: "Otter Fans", slug: "otter-fans" } });
    await db.threadTag.create({ data: { threadId: tagMatch.id, tagId: tag.id } });
    await createTestThread(author.id, category.id, { title: "Hidden Otter", status: "HIDDEN" });

    const otters = await searchThreads("otter");
    expect(new Set(otters.map((thread) => thread.id))).toEqual(new Set([titleMatch.id, replyMatch.id, tagMatch.id]));
    const byAuthor = await searchThreads("SEARCH_AUTHOR");
    expect(byAuthor).toHaveLength(3);

    await db.user.update({ where: { id: author.id }, data: { status: "SUSPENDED", suspendedUntil: new Date(Date.now() + 60_000) } });
    await expect(searchThreads("otter")).resolves.toEqual([]);
  });

  it("uses the visibility and cursor indexes for representative PostgreSQL plans", async () => {
    const author = await createTestUser();
    const category = await createTestCategory();
    await createTestThread(author.id, category.id);
    await db.$executeRawUnsafe("SET enable_seqscan = off");
    try {
      const threadPlan = await db.$queryRaw<Array<{ "QUERY PLAN": string }>>(Prisma.sql`
        EXPLAIN SELECT "id" FROM "Thread"
        WHERE "categoryId" = ${category.id} AND "status" = 'PUBLISHED'
        ORDER BY "bumpedAt" DESC, "id" DESC LIMIT 30
      `);
      const notificationPlan = await db.$queryRaw<Array<{ "QUERY PLAN": string }>>(Prisma.sql`
        EXPLAIN SELECT "id" FROM "Notification"
        WHERE "recipientId" = ${author.id}
        ORDER BY "createdAt" DESC, "id" DESC LIMIT 50
      `);
      const replyPlan = await db.$queryRaw<Array<{ "QUERY PLAN": string }>>(Prisma.sql`
        EXPLAIN SELECT "id" FROM "Reply"
        WHERE "threadId" = ${"missing-thread"} AND "parentReplyId" IS NULL
        ORDER BY "createdAt", "id" LIMIT 11
      `);
      expect(threadPlan.map((row) => row["QUERY PLAN"]).join("\n")).toContain("Thread_categoryId_status_bumpedAt_id_idx");
      expect(notificationPlan.map((row) => row["QUERY PLAN"]).join("\n")).toContain("Notification_recipientId_createdAt_id_idx");
      expect(replyPlan.map((row) => row["QUERY PLAN"]).join("\n")).toContain("Reply_threadId_parentReplyId_createdAt_id_idx");
    } finally {
      await db.$executeRawUnsafe("RESET enable_seqscan");
    }
  });

  it("paginates a pathological reply branch without materializing it all at once", async () => {
    const author = await createTestUser();
    const category = await createTestCategory();
    const thread = await createTestThread(author.id, category.id);
    const root = await db.reply.create({ data: { threadId: thread.id, authorId: author.id, body: "Root" } });
    await db.reply.createMany({ data: Array.from({ length: REPLY_BRANCH_PAGE_SIZE + 5 }, (_, index) => ({
      threadId: thread.id, authorId: author.id, parentReplyId: root.id, body: `Child ${index}`,
    })) });

    const first = await listReplyBranches({ threadId: thread.id, branchId: root.id });
    expect(first.items).toHaveLength(REPLY_BRANCH_PAGE_SIZE);
    expect(first.continuations).toEqual([{ rootId: root.id, page: 1 }]);
    const second = await listReplyBranches({ threadId: thread.id, branchId: root.id, branchPage: 1 });
    expect(second.items).toHaveLength(6);
    expect(second.continuations).toEqual([]);
  });
});
