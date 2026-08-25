import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const method = () => vi.fn();
  const db = {
    attachment: { findMany: method(), updateMany: method() },
    user: { findMany: method(), findUnique: method(), update: method() },
    category: { findUnique: method() },
    thread: { create: method(), findUnique: method(), update: method() },
    reply: { create: method(), findUnique: method(), update: method() },
    threadUpvote: { findUnique: method(), create: method(), delete: method(), deleteMany: method() },
    threadDislike: { findUnique: method(), create: method(), delete: method(), deleteMany: method() },
    replyUpvote: { findUnique: method(), create: method(), delete: method(), deleteMany: method() },
    replyDislike: { findUnique: method(), create: method(), delete: method(), deleteMany: method() },
    bookmark: { findUnique: method(), create: method(), delete: method() },
    follow: { findUnique: method(), create: method(), delete: method() },
    notification: { create: method(), createMany: method(), updateMany: method() },
    mailEntry: { findUnique: method() },
    block: { findFirst: method(), upsert: method() },
    report: { findUnique: method(), upsert: method(), update: method() },
    moderationCase: { findFirst: method(), create: method(), update: method() },
    moderationAction: { create: method() },
    $transaction: vi.fn(),
  };
  return {
    db,
    getVerifiedUserRole: vi.fn(),
    requireUser: vi.fn(),
    requireModerator: vi.fn(),
    uploadsEnabled: vi.fn(),
    consumeUserMutation: vi.fn(),
    revalidatePath: vi.fn(),
    redirect: vi.fn(),
  };
});

vi.mock("@/lib/auth", () => ({
  getVerifiedUserRole: mocks.getVerifiedUserRole,
  requireUser: mocks.requireUser,
  requireModerator: mocks.requireModerator,
}));
vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/upload-capability", () => ({ uploadsEnabled: mocks.uploadsEnabled }));
vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rate-limit")>();
  return { ...actual, consumeUserMutation: mocks.consumeUserMutation };
});
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import {
  blockMember, createReply, createThread, deleteReply, deleteThread, markNotificationsRead,
  moderateReport, reportContent, setContentVisibility,
  suspendMember, toggleBookmark, toggleFollow, toggleReplyReaction,
  toggleThreadLock, toggleThreadReaction, updateReply, updateThread,
} from "./forum";

const ids = {
  user: "cm000000000000000000000001",
  other: "cm000000000000000000000002",
  admin: "cm000000000000000000000003",
  category: "cm000000000000000000000004",
  thread: "cm000000000000000000000005",
  reply: "cm000000000000000000000006",
  parentReply: "cm000000000000000000000007",
  mailEntry: "cm000000000000000000000008",
  report: "cm000000000000000000000009",
};
const member = { id: ids.user, role: "MEMBER", status: "ACTIVE" };
const moderator = { id: ids.admin, role: "ADMIN", status: "ACTIVE" };

function form(values: Record<string, string | undefined>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) if (value !== undefined) data.set(key, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue(member);
  mocks.requireModerator.mockResolvedValue(moderator);
  mocks.getVerifiedUserRole.mockResolvedValue("MEMBER");
  mocks.uploadsEnabled.mockReturnValue(false);
  mocks.consumeUserMutation.mockResolvedValue({ allowed: true, retryAfterSeconds: 0, resetAt: new Date().toISOString(), remaining: 10 });
  mocks.db.moderationCase.findFirst.mockResolvedValue(null);
  mocks.db.moderationCase.create.mockResolvedValue({ id: "case-1" });
  mocks.db.moderationAction.create.mockResolvedValue({ id: "action-1" });
  mocks.redirect.mockImplementation((path: string) => { throw new Error(`redirect:${path}`); });
  mocks.db.$transaction.mockImplementation(async (input: unknown) => {
    if (typeof input === "function") return input(mocks.db);
    return Promise.all(input as Promise<unknown>[]);
  });
});

describe("discussion actions", () => {
  it("stops every forum mutation before database access when the member is limited", async () => {
    mocks.consumeUserMutation.mockResolvedValue({
      allowed: false, retryAfterSeconds: 12, resetAt: "2026-08-25T12:00:12.000Z", remaining: 0,
    });
    const actions = [
      () => createReply(new FormData()),
      () => toggleThreadReaction(new FormData()),
      () => toggleReplyReaction(new FormData()),
      () => toggleBookmark(new FormData()),
      () => toggleFollow(new FormData()),
      () => updateThread(new FormData()),
      () => deleteThread(new FormData()),
      () => updateReply(new FormData()),
      () => deleteReply(new FormData()),
      () => blockMember(new FormData()),
      () => reportContent(new FormData()),
      () => markNotificationsRead(),
      () => moderateReport(new FormData()),
      () => toggleThreadLock(new FormData()),
      () => setContentVisibility(new FormData()),
      () => suspendMember(new FormData()),
    ];

    for (const action of actions) {
      await expect(action()).resolves.toEqual(expect.objectContaining({ status: "rate_limited", retryAfterSeconds: 12 }));
    }
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
    expect(mocks.db.thread.findUnique).not.toHaveBeenCalled();
    expect(mocks.db.user.findUnique).not.toHaveBeenCalled();
  });

  it("returns a retryable state without touching content when the member is limited", async () => {
    mocks.consumeUserMutation.mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 12, resetAt: "2026-08-25T12:00:12.000Z", remaining: 0 });
    await expect(createThread(form({ title: "A useful thread", body: "Body", categoryId: ids.category }))).resolves.toEqual({
      status: "rate_limited",
      message: "You’re doing that a little too quickly. Try again in 12 seconds.",
      retryAfterSeconds: 12,
      resetAt: "2026-08-25T12:00:12.000Z",
    });
    expect(mocks.db.category.findUnique).not.toHaveBeenCalled();
    expect(mocks.db.thread.create).not.toHaveBeenCalled();
  });

  it("creates a normalized tagged thread, claims referenced uploads, notifies mentions, and redirects", async () => {
    mocks.uploadsEnabled.mockReturnValue(true);
    mocks.db.category.findUnique.mockResolvedValue({ id: ids.category, postingPolicy: "OPEN" });
    mocks.db.thread.create.mockResolvedValue({ id: ids.thread, slug: "a-useful-thread-abc123" });
    mocks.db.attachment.findMany.mockResolvedValue([
      { id: "attachment-1", url: "https://utfs.io/f/used" },
      { id: "attachment-2", url: "https://utfs.io/f/unused" },
    ]);
    mocks.db.user.findMany.mockResolvedValue([{ id: ids.other }]);

    await expect(createThread(form({
      title: "  A useful thread  ", body: "Hello @Other!\n\n![](https://utfs.io/f/used)",
      categoryId: ids.category, tags: "Next JS, next-js, Prisma, , Testing, UI, Extra, ignored",
    }))).rejects.toThrow("redirect:/t/a-useful-thread-abc123");

    expect(mocks.db.thread.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        title: "A useful thread", authorId: ids.user, categoryId: ids.category,
        tags: { create: expect.arrayContaining([
          expect.objectContaining({ tag: expect.objectContaining({ connectOrCreate: expect.objectContaining({ where: { slug: "next-js" } }) }) }),
        ]) },
      }),
    }));
    expect(mocks.db.attachment.updateMany).toHaveBeenCalledWith({ where: { id: { in: ["attachment-1"] } }, data: { context: "THREAD", targetId: ids.thread } });
    expect(mocks.db.notification.createMany).toHaveBeenCalledWith({ data: [{ type: "MENTION", recipientId: ids.other, actorId: ids.user, threadId: ids.thread }] });
  });

  it("rejects an unknown category and malformed thread input", async () => {
    mocks.db.category.findUnique.mockResolvedValue(null);
    await expect(createThread(form({ title: "Valid title", body: "ok", categoryId: ids.category }))).rejects.toThrow("Category not found");
    await expect(createThread(form({ title: "no", body: "ok", categoryId: ids.category }))).rejects.toThrow();
  });

  it("creates a reply transaction, bumps the thread, notifies its author, and revalidates", async () => {
    mocks.db.thread.findUnique.mockResolvedValue({ id: ids.thread, slug: "topic", authorId: ids.other, isLocked: false, status: "PUBLISHED", category: { postingPolicy: "OPEN" } });
    mocks.db.reply.create.mockResolvedValue({ id: ids.reply });
    mocks.db.thread.update.mockResolvedValue({});
    mocks.db.notification.create.mockResolvedValue({});
    await expect(createReply(form({ threadId: ids.thread, body: "A reply" }))).resolves.toEqual({ status: "success", replyId: ids.reply });
    expect(mocks.db.reply.create).toHaveBeenCalledWith({ data: { body: "A reply", threadId: ids.thread, authorId: ids.user } });
    expect(mocks.db.notification.create).toHaveBeenCalledWith({ data: expect.objectContaining({ type: "REPLY", recipientId: ids.other, replyId: ids.reply }) });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/t/topic");
  });

  it("rejects replies to missing, hidden, or locked threads", async () => {
    for (const thread of [null, { status: "HIDDEN" }, { status: "PUBLISHED", isLocked: true }]) {
      mocks.db.thread.findUnique.mockResolvedValueOnce(thread);
      await expect(createReply(form({ threadId: ids.thread, body: "A reply" }))).rejects.toThrow(thread?.isLocked ? "locked" : "not found");
    }
  });

  it("does not notify an author replying to their own thread", async () => {
    mocks.db.thread.findUnique.mockResolvedValue({ id: ids.thread, slug: "topic", authorId: ids.user, isLocked: false, status: "PUBLISHED", category: { postingPolicy: "OPEN" } });
    mocks.db.reply.create.mockResolvedValue({ id: ids.reply });
    await createReply(form({ threadId: ids.thread, body: "Self reply" }));
    expect(mocks.db.notification.create).not.toHaveBeenCalled();
  });

  it("creates a nested reply and notifies its direct parent author instead of the thread author", async () => {
    mocks.db.thread.findUnique.mockResolvedValue({ id: ids.thread, slug: "topic", authorId: ids.admin, isLocked: false, status: "PUBLISHED", category: { postingPolicy: "OPEN", archivedAt: null } });
    mocks.db.reply.findUnique.mockResolvedValue({ id: ids.parentReply, authorId: ids.other, threadId: ids.thread, status: "PUBLISHED" });
    mocks.db.reply.create.mockResolvedValue({ id: ids.reply, parentReplyId: ids.parentReply });

    await createReply(form({ threadId: ids.thread, parentReplyId: ids.parentReply, body: "A nested reply" }));

    expect(mocks.db.reply.create).toHaveBeenCalledWith({ data: { body: "A nested reply", threadId: ids.thread, authorId: ids.user, parentReplyId: ids.parentReply } });
    expect(mocks.db.notification.create).toHaveBeenCalledWith({ data: { type: "REPLY", recipientId: ids.other, actorId: ids.user, threadId: ids.thread, replyId: ids.reply } });
  });

  it("suppresses nested self-notifications", async () => {
    mocks.db.thread.findUnique.mockResolvedValue({ id: ids.thread, slug: "topic", authorId: ids.other, isLocked: false, status: "PUBLISHED", category: { postingPolicy: "OPEN", archivedAt: null } });
    mocks.db.reply.findUnique.mockResolvedValue({ id: ids.parentReply, authorId: ids.user, threadId: ids.thread, status: "PUBLISHED" });
    mocks.db.reply.create.mockResolvedValue({ id: ids.reply });

    await createReply(form({ threadId: ids.thread, parentReplyId: ids.parentReply, body: "Replying to myself" }));
    expect(mocks.db.notification.create).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", null],
    ["hidden", { id: ids.parentReply, authorId: ids.other, threadId: ids.thread, status: "HIDDEN" }],
    ["deleted", { id: ids.parentReply, authorId: ids.other, threadId: ids.thread, status: "DELETED" }],
    ["cross-thread", { id: ids.parentReply, authorId: ids.other, threadId: ids.admin, status: "PUBLISHED" }],
  ])("rejects a %s nested-reply parent", async (_case, parent) => {
    mocks.db.thread.findUnique.mockResolvedValue({ id: ids.thread, slug: "topic", authorId: ids.other, isLocked: false, status: "PUBLISHED", category: { postingPolicy: "OPEN", archivedAt: null } });
    mocks.db.reply.findUnique.mockResolvedValue(parent);

    await expect(createReply(form({ threadId: ids.thread, parentReplyId: ids.parentReply, body: "Invalid nested reply" }))).rejects.toThrow("Parent reply not found");
    expect(mocks.db.reply.create).not.toHaveBeenCalled();
  });

  it("rejects replies in archived spaces", async () => {
    mocks.db.thread.findUnique.mockResolvedValue({ id: ids.thread, slug: "topic", authorId: ids.other, isLocked: false, status: "PUBLISHED", category: { postingPolicy: "OPEN", archivedAt: new Date() } });
    await expect(createReply(form({ threadId: ids.thread, body: "Archived reply" }))).rejects.toThrow("Thread not found");
  });

  it.each(["ANNOUNCEMENTS", "ADMIN_ONLY"] as const)("denies members and moderators from starting discussions under %s", async (postingPolicy) => {
    mocks.db.category.findUnique.mockResolvedValue({ id: ids.category, postingPolicy });
    for (const role of ["MEMBER", "MODERATOR"] as const) {
      mocks.requireUser.mockResolvedValueOnce({ ...member, role });
      await expect(createThread(form({ title: "A valid title", body: "Body", categoryId: ids.category }))).rejects.toThrow("permission");
    }
    expect(mocks.db.thread.create).not.toHaveBeenCalled();
  });

  it.each(["OPEN", "ANNOUNCEMENTS", "ADMIN_ONLY"] as const)("allows administrators to start discussions under %s", async (postingPolicy) => {
    mocks.requireUser.mockResolvedValue({ ...member, role: "ADMIN" });
    mocks.db.category.findUnique.mockResolvedValue({ id: ids.category, postingPolicy });
    mocks.db.thread.create.mockResolvedValue({ id: ids.thread, slug: "admin-topic" });
    await expect(createThread(form({ title: "An admin title", body: "Body", categoryId: ids.category }))).rejects.toThrow("redirect:/t/admin-topic");
  });

  it("allows member comments in announcements and denies them in admin-only spaces", async () => {
    mocks.db.thread.findUnique
      .mockResolvedValueOnce({ id: ids.thread, slug: "topic", authorId: ids.other, isLocked: false, status: "PUBLISHED", category: { postingPolicy: "ANNOUNCEMENTS" } })
      .mockResolvedValueOnce({ id: ids.thread, slug: "topic", authorId: ids.other, isLocked: false, status: "PUBLISHED", category: { postingPolicy: "ADMIN_ONLY" } });
    mocks.db.reply.create.mockResolvedValue({ id: ids.reply });

    await createReply(form({ threadId: ids.thread, body: "Allowed reply" }));
    await expect(createReply(form({ threadId: ids.thread, body: "Denied reply" }))).rejects.toThrow("permission");
    expect(mocks.db.reply.create).toHaveBeenCalledTimes(1);
  });

  it("keeps thread locks absolute for administrators", async () => {
    mocks.requireUser.mockResolvedValue({ ...member, role: "ADMIN" });
    mocks.db.thread.findUnique.mockResolvedValue({ id: ids.thread, slug: "topic", authorId: ids.other, isLocked: true, status: "PUBLISHED", category: { postingPolicy: "OPEN" } });
    await expect(createReply(form({ threadId: ids.thread, body: "Admin reply" }))).rejects.toThrow("locked");
    expect(mocks.db.reply.create).not.toHaveBeenCalled();
  });

  it.each([
    ["thread", toggleThreadReaction, "threadId", "threadUpvote", "userId_threadId"],
    ["reply", toggleReplyReaction, "replyId", "replyUpvote", "userId_replyId"],
  ] as const)("adds and removes a %s upvote", async (kind, action, idName, modelName, compound) => {
    const targetId = kind === "thread" ? ids.thread : ids.reply;
    const model = mocks.db[modelName];
    const targetModel = kind === "thread" ? mocks.db.thread : mocks.db.reply;
    targetModel.findUnique.mockResolvedValue(kind === "thread"
      ? { authorId: ids.other, status: "PUBLISHED" }
      : { authorId: ids.other, threadId: ids.thread, status: "PUBLISHED" });
    model.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ userId: ids.user });
    await action(form({ [idName]: targetId, reaction: "UPVOTE", returnTo: "/safe" }));
    expect(model.create).toHaveBeenCalled();
    expect(mocks.db.notification.create).toHaveBeenCalledWith({ data: expect.objectContaining({ type: "UPVOTE", recipientId: ids.other }) });
    await action(form({ [idName]: targetId, reaction: "UPVOTE", returnTo: "https://evil.example" }));
    expect(model.delete).toHaveBeenCalledWith({ where: { [compound]: expect.any(Object) } });
    expect(mocks.revalidatePath).toHaveBeenLastCalledWith("/");
  });

  it.each([
    ["thread", toggleThreadReaction, "threadId", "threadUpvote", "threadDislike"],
    ["reply", toggleReplyReaction, "replyId", "replyUpvote", "replyDislike"],
  ] as const)("switches a %s reaction atomically in either direction", async (kind, action, idName, upvoteName, dislikeName) => {
    const targetId = kind === "thread" ? ids.thread : ids.reply;
    const targetModel = kind === "thread" ? mocks.db.thread : mocks.db.reply;
    targetModel.findUnique.mockResolvedValue(kind === "thread"
      ? { authorId: ids.other, status: "PUBLISHED" }
      : { authorId: ids.other, threadId: ids.thread, status: "PUBLISHED" });

    mocks.db[dislikeName].findUnique.mockResolvedValue(null);
    await action(form({ [idName]: targetId, reaction: "DISLIKE" }));
    expect(mocks.db[upvoteName].deleteMany).toHaveBeenCalledWith({ where: expect.objectContaining({ userId: ids.user }) });
    expect(mocks.db[dislikeName].create).toHaveBeenCalled();
    expect(mocks.db.notification.create).not.toHaveBeenCalled();

    mocks.db.$transaction.mockClear();
    mocks.db.notification.create.mockClear();
    mocks.db[upvoteName].create.mockClear();
    mocks.db[dislikeName].deleteMany.mockClear();
    mocks.db[upvoteName].findUnique.mockResolvedValue(null);
    await action(form({ [idName]: targetId, reaction: "UPVOTE" }));
    expect(mocks.db[dislikeName].deleteMany).toHaveBeenCalledWith({ where: expect.objectContaining({ userId: ids.user }) });
    expect(mocks.db[upvoteName].create).toHaveBeenCalled();
    expect(mocks.db.notification.create).toHaveBeenCalledWith({ data: expect.objectContaining({ type: "UPVOTE" }) });
    expect(mocks.db.$transaction).toHaveBeenCalledTimes(1);
  });

  it("validates reaction values before accessing content", async () => {
    await expect(toggleThreadReaction(form({ threadId: ids.thread, reaction: "LIKE" }))).rejects.toThrow();
    expect(mocks.db.thread.findUnique).not.toHaveBeenCalled();
  });

  it.each([
    ["thread", toggleThreadReaction, "threadId", "threadUpvote", "Thread not found"],
    ["reply", toggleReplyReaction, "replyId", "replyUpvote", "Reply not found"],
  ] as const)("rejects unpublished %s targets and skips self-upvote notifications", async (kind, action, idName, upvoteName, notFoundMessage) => {
    const targetId = kind === "thread" ? ids.thread : ids.reply;
    const targetModel = kind === "thread" ? mocks.db.thread : mocks.db.reply;
    targetModel.findUnique.mockResolvedValueOnce({ status: "HIDDEN" }).mockResolvedValueOnce(kind === "thread"
      ? { authorId: ids.user, status: "PUBLISHED" }
      : { authorId: ids.user, threadId: ids.thread, status: "PUBLISHED" });
    await expect(action(form({ [idName]: targetId, reaction: "UPVOTE" }))).rejects.toThrow(notFoundMessage);
    mocks.db[upvoteName].findUnique.mockResolvedValue(null);
    await action(form({ [idName]: targetId, reaction: "UPVOTE" }));
    expect(mocks.db.notification.create).not.toHaveBeenCalled();
  });

  it.each(["thread", "reply"] as const)("removes an active %s dislike without creating a notification", async (kind) => {
    const action = kind === "thread" ? toggleThreadReaction : toggleReplyReaction;
    const idName = kind === "thread" ? "threadId" : "replyId";
    const targetId = kind === "thread" ? ids.thread : ids.reply;
    const targetModel = kind === "thread" ? mocks.db.thread : mocks.db.reply;
    const dislikeModel = kind === "thread" ? mocks.db.threadDislike : mocks.db.replyDislike;
    targetModel.findUnique.mockResolvedValue(kind === "thread"
      ? { authorId: ids.other, status: "PUBLISHED" }
      : { authorId: ids.other, threadId: ids.thread, status: "PUBLISHED" });
    dislikeModel.findUnique.mockResolvedValue({ userId: ids.user });

    await action(form({ [idName]: targetId, reaction: "DISLIKE" }));

    expect(dislikeModel.delete).toHaveBeenCalled();
    expect(mocks.db.notification.create).not.toHaveBeenCalled();
  });

  it("toggles bookmarks", async () => {
    mocks.db.bookmark.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ userId: ids.user });
    await toggleBookmark(form({ threadId: ids.thread, returnTo: "/bookmarks" }));
    await toggleBookmark(form({ threadId: ids.thread, returnTo: "/bookmarks" }));
    expect(mocks.db.bookmark.create).toHaveBeenCalled();
    expect(mocks.db.bookmark.delete).toHaveBeenCalled();
  });
});

describe("member and content ownership actions", () => {
  it("toggles following and creates a notification", async () => {
    mocks.db.follow.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({});
    await toggleFollow(form({ userId: ids.other, returnTo: "/members/x" }));
    await toggleFollow(form({ userId: ids.other, returnTo: "/members/x" }));
    expect(mocks.db.follow.create).toHaveBeenCalled();
    expect(mocks.db.follow.delete).toHaveBeenCalled();
    expect(mocks.db.notification.create).toHaveBeenCalledWith({ data: { type: "FOLLOW", recipientId: ids.other, actorId: ids.user } });
  });

  it("prevents following or blocking oneself", async () => {
    await expect(toggleFollow(form({ userId: ids.user }))).rejects.toThrow("follow yourself");
    await expect(blockMember(form({ userId: ids.user }))).rejects.toThrow("block yourself");
  });

  it.each([
    ["thread", updateThread, "threadId", "thread", { title: "Updated title", body: "Updated body" }],
    ["reply", updateReply, "replyId", "reply", { body: "Updated reply" }],
  ] as const)("allows owners and staff to update a %s, but rejects other members", async (kind, action, idName, modelName, values) => {
    const model = mocks.db[modelName];
    const targetId = kind === "thread" ? ids.thread : ids.reply;
    model.findUnique.mockResolvedValue({ id: targetId, authorId: ids.user, slug: "topic", thread: { slug: "topic" } });
    const promise = action(form({ [idName]: targetId, ...values }));
    if (kind === "thread") await expect(promise).rejects.toThrow("redirect:/t/topic"); else await promise;
    expect(model.update).toHaveBeenCalled();

    model.findUnique.mockResolvedValue({ authorId: ids.other, slug: "topic", thread: { slug: "topic" } });
    await expect(action(form({ [idName]: targetId, ...values }))).rejects.toThrow("cannot edit");
  });

  it.each([
    ["thread", deleteThread, "threadId", "thread"],
    ["reply", deleteReply, "replyId", "reply"],
  ] as const)("soft-deletes an owned %s and rejects unauthorized deletion", async (kind, action, idName, modelName) => {
    const model = mocks.db[modelName];
    const targetId = kind === "thread" ? ids.thread : ids.reply;
    model.findUnique.mockResolvedValue({ authorId: ids.user, slug: "topic", thread: { slug: "topic" } });
    const promise = action(form({ [idName]: targetId }));
    if (kind === "thread") await expect(promise).rejects.toThrow("redirect:/"); else await promise;
    expect(model.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "DELETED", deletedAt: expect.any(Date) }) }));

    model.findUnique.mockResolvedValue({ authorId: ids.other, slug: "topic", thread: { slug: "topic" } });
    await expect(action(form({ [idName]: targetId }))).rejects.toThrow("cannot delete");
  });
});

describe("reports, blocking, and notifications", () => {
  it("blocks another member idempotently", async () => {
    await blockMember(form({ userId: ids.other }));
    expect(mocks.db.block.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: { blockerId: ids.user, blockedId: ids.other } }));
  });

  it.each([
    ["THREAD", "thread"], ["REPLY", "reply"], ["USER", "user"], ["MAIL_ENTRY", "mailEntry"],
  ] as const)("creates or reopens a %s report after checking visibility", async (targetType, modelName) => {
    mocks.db[modelName].findUnique.mockResolvedValue({ id: ids.thread });
    await reportContent(form({ targetType, targetId: ids.thread, reason: "Spam", details: "Repeated", returnTo: "/safe" }));
    expect(mocks.db.report.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { reporterId_targetType_targetId: { reporterId: ids.user, targetType, targetId: ids.thread } },
      update: expect.objectContaining({ caseId: "case-1", reason: "Spam" }),
      create: expect.objectContaining({ caseId: "case-1", reporterId: ids.user }),
    }));
  });

  it("rejects reports for invisible targets", async () => {
    mocks.db.mailEntry.findUnique.mockResolvedValue(null);
    await expect(reportContent(form({ targetType: "MAIL_ENTRY", targetId: ids.mailEntry, reason: "Spam" }))).rejects.toThrow("does not exist");
  });

  it("marks all unread notifications read", async () => {
    await markNotificationsRead();
    expect(mocks.db.notification.updateMany).toHaveBeenCalledWith({ where: { recipientId: ids.user, readAt: null }, data: { readAt: expect.any(Date) } });
  });
});

describe("moderation actions", () => {
  it.each(["RESOLVED", "DISMISSED"] as const)("records a %s report decision and audit action", async (decision) => {
    mocks.db.report.findUnique.mockResolvedValue({ id: ids.report, caseId: "case-1", targetType: "THREAD", targetId: ids.thread, case: { assignedToId: null } });
    await moderateReport(form({ reportId: ids.report, decision, resolution: "Reviewed" }));
    expect(mocks.db.moderationCase.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "case-1" }, data: expect.objectContaining({ status: decision, assignedToId: ids.admin }) }));
    expect(mocks.db.moderationAction.create).toHaveBeenCalledWith({ data: expect.objectContaining({ type: decision === "RESOLVED" ? "RESOLVE_REPORT" : "DISMISS_REPORT" }) });
  });

  it("rejects a missing report", async () => {
    mocks.db.report.findUnique.mockResolvedValue(null);
    await expect(moderateReport(form({ reportId: ids.report, decision: "RESOLVED", resolution: "Reviewed" }))).rejects.toThrow("Report not found");
  });

  it.each([false, true])("toggles thread lock state from %s", async (isLocked) => {
    mocks.db.thread.findUnique.mockResolvedValue({ id: ids.thread, slug: "topic", isLocked, authorId: ids.other });
    await toggleThreadLock(form({ threadId: ids.thread }));
    expect(mocks.db.thread.update).toHaveBeenCalledWith({ where: { id: ids.thread }, data: { isLocked: !isLocked } });
    expect(mocks.db.moderationAction.create).toHaveBeenCalledWith({ data: expect.objectContaining({ type: isLocked ? "UNLOCK" : "LOCK" }) });
  });

  it("rejects locking a missing thread", async () => {
    mocks.db.thread.findUnique.mockResolvedValue(null);
    await expect(toggleThreadLock(form({ threadId: ids.thread }))).rejects.toThrow("Thread not found");
  });

  it.each([
    ["THREAD", "true", "thread", "HIDE"],
    ["REPLY", "false", "reply", "RESTORE"],
  ] as const)("changes %s visibility and audits it", async (targetType, hide, modelName, type) => {
    if (targetType === "THREAD") mocks.db.thread.findUnique.mockResolvedValue({ authorId: ids.other });
    else mocks.db.reply.findUnique.mockResolvedValue({ authorId: ids.other, threadId: ids.thread });
    await setContentVisibility(form({ targetType, targetId: ids.thread, hide, reason: "Reviewed" }));
    expect(mocks.db[modelName].update).toHaveBeenCalledWith({ where: { id: ids.thread }, data: { status: hide === "true" ? "HIDDEN" : "PUBLISHED" } });
    expect(mocks.db.moderationAction.create).toHaveBeenCalledWith({ data: expect.objectContaining({ type }) });
  });

  it("suspends a non-admin with an audit record and notification", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-24T12:00:00Z"));
    mocks.db.user.findUnique.mockResolvedValue({ id: ids.other, clerkId: "user_other", role: "MEMBER" });
    await suspendMember(form({ userId: ids.other, days: "2", reason: "Repeated abuse" }));
    expect(mocks.db.user.update).toHaveBeenCalledWith({ where: { id: ids.other }, data: expect.objectContaining({ status: "SUSPENDED", suspendedUntil: new Date("2026-08-26T12:00:00Z") }) });
    expect(mocks.db.notification.create).toHaveBeenCalledWith({ data: expect.objectContaining({ type: "MODERATION", recipientId: ids.other, actorId: ids.admin, moderationActionId: "action-1" }) });
    vi.useRealTimers();
  });

  it("does not suspend missing users, current administrators, or unverified targets", async () => {
    mocks.db.user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ clerkId: "user_admin", role: "MEMBER" })
      .mockResolvedValueOnce({ clerkId: "user_unverified", role: "MEMBER" });
    mocks.getVerifiedUserRole.mockResolvedValueOnce("ADMIN").mockResolvedValueOnce(null);
    for (let i = 0; i < 3; i += 1) {
      await expect(suspendMember(form({ userId: ids.other, days: "7", reason: "Repeated abuse" }))).rejects.toThrow("cannot be suspended");
    }
  });

  it("uses current Clerk metadata instead of a stale cached administrator role", async () => {
    mocks.db.user.findUnique.mockResolvedValue({ id: ids.other, clerkId: "user_other", role: "ADMIN" });
    mocks.getVerifiedUserRole.mockResolvedValue("MEMBER");
    await suspendMember(form({ userId: ids.other, days: "7", reason: "Repeated abuse" }));
    expect(mocks.db.user.update).toHaveBeenCalledWith({
      where: { id: ids.other },
      data: expect.objectContaining({ status: "SUSPENDED" }),
    });
  });
});
