import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createTestCategory, createTestThread, createTestUser } from "@/test/integration-factories";
import { listThreads, searchThreads } from "./queries";

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
  });
});
