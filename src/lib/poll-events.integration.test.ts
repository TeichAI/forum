import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { closePollEventListenerForTests, subscribeToPoll } from "@/lib/poll-events";
import { createTestCategory, createTestThread, createTestUser } from "@/test/integration-factories";

afterEach(() => closePollEventListenerForTests());

describe("poll vote notifications against PostgreSQL", () => {
  it("fans committed inserts, updates, and deletes through the dedicated listener", async () => {
    const [author, voter] = await Promise.all([createTestUser(), createTestUser()]);
    const category = await createTestCategory();
    const thread = await createTestThread(author.id, category.id);
    const poll = await db.poll.create({
      data: {
        threadId: thread.id,
        question: "Which signal?",
        expiresAt: new Date(Date.now() + 60_000),
        options: { create: [{ text: "First", position: 0 }, { text: "Second", position: 1 }] },
      },
      include: { options: { orderBy: { position: "asc" } } },
    });
    const changed = vi.fn();
    const unsubscribe = await subscribeToPoll(poll.id, changed);

    await db.pollVote.create({ data: { pollId: poll.id, optionId: poll.options[0]!.id, userId: voter.id } });
    await vi.waitFor(() => expect(changed).toHaveBeenCalledTimes(1));
    await db.pollVote.update({ where: { pollId_userId: { pollId: poll.id, userId: voter.id } }, data: { optionId: poll.options[1]!.id } });
    await vi.waitFor(() => expect(changed).toHaveBeenCalledTimes(2));
    await db.pollVote.delete({ where: { pollId_userId: { pollId: poll.id, userId: voter.id } } });
    await vi.waitFor(() => expect(changed).toHaveBeenCalledTimes(3));
    unsubscribe();
  });
});
