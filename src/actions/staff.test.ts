import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const method = () => vi.fn();
  const db = {
    moderationCase: { findUnique: method(), update: method(), updateMany: method() },
    moderationAction: { create: method() },
    notification: { create: method() },
    staffNote: { create: method() },
    user: { findUnique: method(), update: method() },
    thread: { findUnique: method(), update: method() },
    reply: { findUnique: method(), update: method() },
    category: { findUnique: method(), update: method(), findFirst: method(), aggregate: method(), upsert: method() },
    tag: { findFirst: method(), update: method(), findUnique: method(), delete: method() },
    tagAlias: { updateMany: method(), upsert: method() },
    threadTag: { createMany: method(), deleteMany: method() },
    moderationSettings: { upsert: method() },
    $transaction: vi.fn(),
  };
  return {
    db, requireModerator: vi.fn(), requireAdmin: vi.fn(), getVerifiedUserRole: vi.fn(),
    revalidatePath: vi.fn(), canModerateRole: vi.fn(),
  };
});

vi.mock("@/lib/auth", () => ({
  requireModerator: mocks.requireModerator,
  requireAdmin: mocks.requireAdmin,
  getVerifiedUserRole: mocks.getVerifiedUserRole,
}));
vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/moderation", () => ({ canModerateRole: mocks.canModerateRole }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import {
  addStaffNote, changeSpaceState, claimCase, closeCase, mergeTag, moderateContent, renameTag,
  saveModerationSettings, saveSpace, setCasePriority, setMemberSuspension,
} from "./staff";

const ids = {
  moderator: "cm000000000000000000000001",
  admin: "cm000000000000000000000002",
  member: "cm000000000000000000000003",
  target: "cm000000000000000000000004",
  case: "cm000000000000000000000005",
  space: "cm000000000000000000000006",
};
const moderator = { id: ids.moderator, role: "MODERATOR" as const };
const admin = { id: ids.admin, role: "ADMIN" as const };

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireModerator.mockResolvedValue(moderator);
  mocks.requireAdmin.mockResolvedValue(admin);
  mocks.getVerifiedUserRole.mockResolvedValue("MEMBER");
  mocks.canModerateRole.mockImplementation((actor: string, target: string) => target !== "ADMIN" && (actor === "ADMIN" || target === "MEMBER"));
  mocks.db.moderationAction.create.mockResolvedValue({ id: "action-1" });
  mocks.db.moderationCase.updateMany.mockResolvedValue({ count: 1 });
  mocks.db.$transaction.mockImplementation(async (input: unknown) => typeof input === "function" ? input(mocks.db) : Promise.all(input as Promise<unknown>[]));
});

describe("staff case workflows", () => {
  it("claims an open case and records an auditable assignment", async () => {
    mocks.db.moderationCase.findUnique.mockResolvedValue({ id: ids.case, status: "OPEN", assignedToId: null, targetType: "THREAD", targetId: ids.target });
    const result = await claimCase({ status: "idle" }, form({ caseId: ids.case }));
    expect(result).toEqual({ status: "success", message: "Case assigned to you." });
    expect(mocks.db.moderationCase.updateMany).toHaveBeenCalledWith({
      where: { id: ids.case, assignedToId: null, status: { in: ["OPEN", "IN_REVIEW"] } },
      data: { assignedToId: ids.moderator, status: "IN_REVIEW" },
    });
    expect(mocks.db.moderationAction.create).toHaveBeenCalledWith({ data: expect.objectContaining({ type: "CLAIM_REPORT", caseId: ids.case }) });
  });

  it("does not steal a case assigned to another moderator", async () => {
    mocks.db.moderationCase.findUnique.mockResolvedValue({ id: ids.case, status: "IN_REVIEW", assignedToId: "someone-else" });
    await expect(claimCase({ status: "idle" }, form({ caseId: ids.case }))).resolves.toEqual({ status: "error", message: "This case is already assigned to another staff member." });
    expect(mocks.db.moderationCase.updateMany).not.toHaveBeenCalled();
  });

  it("does not record a claim when another moderator wins the conditional update", async () => {
    mocks.db.moderationCase.findUnique
      .mockResolvedValueOnce({ id: ids.case, status: "OPEN", assignedToId: null, targetType: "THREAD", targetId: ids.target })
      .mockResolvedValueOnce({ id: ids.case, status: "IN_REVIEW", assignedToId: "someone-else" });
    mocks.db.moderationCase.updateMany.mockResolvedValue({ count: 0 });

    await expect(claimCase({ status: "idle" }, form({ caseId: ids.case }))).resolves.toEqual({
      status: "error",
      message: "This case is already assigned to another staff member.",
    });
    expect(mocks.db.moderationAction.create).not.toHaveBeenCalled();
  });

  it("returns actionable errors for invalid, missing, and closed cases", async () => {
    await expect(claimCase({ status: "idle" }, form({ caseId: "bad" }))).resolves.toEqual(expect.objectContaining({ status: "error" }));
    mocks.db.moderationCase.findUnique.mockResolvedValue(null);
    await expect(claimCase({ status: "idle" }, form({ caseId: ids.case }))).resolves.toEqual({ status: "error", message: "This case is already closed." });
    mocks.db.moderationCase.findUnique.mockResolvedValue({ id: ids.case, status: "RESOLVED" });
    await expect(claimCase({ status: "idle" }, form({ caseId: ids.case }))).resolves.toEqual({ status: "error", message: "This case is already closed." });
    await expect(setCasePriority({ status: "idle" }, form({ caseId: ids.case, priority: "INVALID" }))).resolves.toEqual(expect.objectContaining({ status: "error" }));
    mocks.db.moderationCase.findUnique.mockResolvedValue(null);
    await expect(setCasePriority({ status: "idle" }, form({ caseId: ids.case, priority: "LOW" }))).resolves.toEqual({ status: "error", message: "Case not found." });
    await expect(closeCase({ status: "idle" }, form({ caseId: ids.case, decision: "RESOLVED", reason: "x" }))).resolves.toEqual(expect.objectContaining({ status: "error" }));
    mocks.db.moderationCase.findUnique.mockResolvedValue({ id: ids.case, status: "OPEN" });
    await expect(closeCase({ status: "idle" }, form({ caseId: ids.case, decision: "REOPEN", reason: "New evidence" }))).resolves.toEqual({ status: "error", message: "Only a closed case can be reopened." });
    mocks.db.moderationCase.findUnique.mockResolvedValue({ id: ids.case, status: "DISMISSED" });
    await expect(closeCase({ status: "idle" }, form({ caseId: ids.case, decision: "RESOLVED", reason: "Reviewed" }))).resolves.toEqual({ status: "error", message: "This case is already closed." });
  });

  it("closes and reopens cases with required reasons", async () => {
    mocks.db.moderationCase.findUnique.mockResolvedValue({ id: ids.case, status: "IN_REVIEW", assignedToId: ids.moderator, targetType: "USER", targetId: ids.member });
    await expect(closeCase({ status: "idle" }, form({ caseId: ids.case, decision: "RESOLVED", reason: "Reviewed evidence" }))).resolves.toEqual({ status: "success", message: "Case resolved." });
    expect(mocks.db.moderationCase.update).toHaveBeenCalledWith({ where: { id: ids.case }, data: expect.objectContaining({ status: "RESOLVED", resolution: "Reviewed evidence", closedAt: expect.any(Date) }) });

    mocks.db.moderationCase.findUnique.mockResolvedValue({ id: ids.case, status: "RESOLVED", assignedToId: ids.moderator, targetType: "USER", targetId: ids.member });
    await expect(closeCase({ status: "idle" }, form({ caseId: ids.case, decision: "REOPEN", reason: "New evidence" }))).resolves.toEqual({ status: "success", message: "Case reopened." });
    expect(mocks.db.moderationCase.update).toHaveBeenLastCalledWith({ where: { id: ids.case }, data: { status: "OPEN", resolution: null, closedAt: null, assignedToId: null } });
  });

  it("updates priority and appends notes to cases and eligible members", async () => {
    mocks.db.moderationCase.findUnique.mockResolvedValue({ id: ids.case, targetType: "THREAD", targetId: ids.target });
    await expect(setCasePriority({ status: "idle" }, form({ caseId: ids.case, priority: "URGENT" }))).resolves.toEqual({ status: "success", message: "Priority updated." });
    expect(mocks.db.moderationCase.update).toHaveBeenCalledWith({ where: { id: ids.case }, data: { priority: "URGENT" } });

    await expect(addStaffNote({ status: "idle" }, form({ caseId: ids.case, body: "Case context" }))).resolves.toEqual({ status: "success", message: "Private staff note added." });
    mocks.db.user.findUnique.mockResolvedValue({ id: ids.member, clerkId: "member", role: "MEMBER" });
    await expect(addStaffNote({ status: "idle" }, form({ userId: ids.member, body: "Member context" }))).resolves.toEqual({ status: "success", message: "Private staff note added." });
    expect(mocks.db.staffNote.create).toHaveBeenCalledTimes(2);
  });

  it("validates staff-note targets and protected users", async () => {
    await expect(addStaffNote({ status: "idle" }, form({ body: "Note" }))).resolves.toEqual(expect.objectContaining({ status: "error" }));
    mocks.db.user.findUnique.mockResolvedValue(null);
    await expect(addStaffNote({ status: "idle" }, form({ userId: ids.member, body: "Note" }))).resolves.toEqual({ status: "error", message: "Member not found." });
    mocks.db.user.findUnique.mockResolvedValue({ id: ids.member, clerkId: "deleted", role: "MEMBER", status: "DELETED" });
    await expect(addStaffNote({ status: "idle" }, form({ userId: ids.member, body: "Note" }))).resolves.toEqual({ status: "error", message: "Deleted accounts cannot be moderated." });
    mocks.db.user.findUnique.mockResolvedValue({ id: ids.member, clerkId: "admin", role: "ADMIN" });
    mocks.getVerifiedUserRole.mockResolvedValue("ADMIN");
    mocks.canModerateRole.mockReturnValue(false);
    await expect(addStaffNote({ status: "idle" }, form({ userId: ids.member, body: "Note" }))).resolves.toEqual({ status: "error", message: "You cannot add notes to this staff account." });
    mocks.db.moderationCase.findUnique.mockResolvedValue(null);
    await expect(addStaffNote({ status: "idle" }, form({ caseId: ids.case, body: "Note" }))).resolves.toEqual({ status: "error", message: "Case not found." });
  });
});

describe("staff moderation boundaries", () => {
  it("hides real thread content and notifies its author through the audit action", async () => {
    mocks.db.thread.findUnique.mockResolvedValue({ id: ids.target, slug: "topic", authorId: ids.member, status: "PUBLISHED", isLocked: false, isPinned: false });
    const result = await moderateContent({ status: "idle" }, form({ targetType: "THREAD", targetId: ids.target, action: "HIDE", reason: "Unsafe content" }));
    expect(result.status).toBe("success");
    expect(mocks.db.thread.update).toHaveBeenCalledWith({ where: { id: ids.target }, data: { status: "HIDDEN" } });
    expect(mocks.db.notification.create).toHaveBeenCalledWith({ data: expect.objectContaining({ recipientId: ids.member, moderationActionId: "action-1" }) });
  });

  it("prevents moderators from suspending staff and lets admins suspend moderators", async () => {
    mocks.db.user.findUnique.mockResolvedValue({ id: ids.member, clerkId: "clerk-target", role: "MODERATOR" });
    mocks.getVerifiedUserRole.mockResolvedValue("MODERATOR");
    mocks.canModerateRole.mockReturnValue(false);
    await expect(setMemberSuspension({ status: "idle" }, form({ userId: ids.member, action: "SUSPEND", days: "7", reason: "Repeated abuse" }))).resolves.toEqual({ status: "error", message: "This staff account is protected." });
    mocks.requireModerator.mockResolvedValue(admin);
    mocks.canModerateRole.mockReturnValue(true);
    await expect(setMemberSuspension({ status: "idle" }, form({ userId: ids.member, action: "SUSPEND", days: "7", reason: "Repeated abuse" }))).resolves.toEqual({ status: "success", message: "Member suspended." });
    expect(mocks.db.user.update).toHaveBeenCalledWith({ where: { id: ids.member }, data: expect.objectContaining({ status: "SUSPENDED", suspendedUntil: expect.any(Date) }) });

    await expect(setMemberSuspension({ status: "idle" }, form({ userId: ids.member, action: "UNSUSPEND", reason: "Appeal accepted" }))).resolves.toEqual({ status: "success", message: "Member restored." });
    expect(mocks.db.user.update).toHaveBeenLastCalledWith({ where: { id: ids.member }, data: { status: "ACTIVE", suspendedUntil: null, suspensionReason: null } });
  });

  it("restores replies but refuses to restore member-deleted content", async () => {
    mocks.db.reply.findUnique.mockResolvedValue({ id: ids.target, authorId: ids.member, status: "HIDDEN", thread: { id: "thread-1", slug: "topic" } });
    await expect(moderateContent({ status: "idle" }, form({ targetType: "REPLY", targetId: ids.target, action: "RESTORE", reason: "Appeal accepted" }))).resolves.toEqual(expect.objectContaining({ status: "success" }));
    expect(mocks.db.reply.update).toHaveBeenCalledWith({ where: { id: ids.target }, data: { status: "PUBLISHED" } });
    mocks.db.reply.findUnique.mockResolvedValue({ id: ids.target, authorId: ids.member, status: "DELETED", thread: { id: "thread-1", slug: "topic" } });
    await expect(moderateContent({ status: "idle" }, form({ targetType: "REPLY", targetId: ids.target, action: "RESTORE", reason: "Appeal accepted" }))).resolves.toEqual({ status: "error", message: "Member-deleted content cannot be restored by staff." });
  });

  it("rejects malformed, missing, and unsupported content actions", async () => {
    await expect(moderateContent({ status: "idle" }, form({ targetType: "THREAD", targetId: "bad", action: "HIDE", reason: "Spam" }))).resolves.toEqual(expect.objectContaining({ status: "error" }));
    await expect(moderateContent({ status: "idle" }, form({ targetType: "REPLY", targetId: ids.target, action: "LOCK", reason: "Spam" }))).resolves.toEqual({ status: "error", message: "That action is unavailable for replies." });
    mocks.db.thread.findUnique.mockResolvedValue(null);
    await expect(moderateContent({ status: "idle" }, form({ targetType: "THREAD", targetId: ids.target, action: "HIDE", reason: "Spam" }))).resolves.toEqual({ status: "error", message: "Content not found." });
  });

  it("validates suspension targets, durations, and missing members", async () => {
    await expect(setMemberSuspension({ status: "idle" }, form({ userId: "bad", action: "SUSPEND", reason: "Spam" }))).resolves.toEqual(expect.objectContaining({ status: "error" }));
    mocks.db.user.findUnique.mockResolvedValue(null);
    await expect(setMemberSuspension({ status: "idle" }, form({ userId: ids.member, action: "SUSPEND", days: "7", reason: "Spam" }))).resolves.toEqual({ status: "error", message: "Member not found." });
    mocks.db.user.findUnique.mockResolvedValue({ id: ids.member, clerkId: "deleted", role: "MEMBER", status: "DELETED" });
    await expect(setMemberSuspension({ status: "idle" }, form({ userId: ids.member, action: "UNSUSPEND", reason: "Appeal accepted" }))).resolves.toEqual({ status: "error", message: "Deleted accounts cannot be moderated." });
    expect(mocks.db.user.update).not.toHaveBeenCalled();
    mocks.db.user.findUnique.mockResolvedValue({ id: ids.member, clerkId: "member", role: "MEMBER" });
    mocks.getVerifiedUserRole.mockResolvedValue("MEMBER");
    mocks.canModerateRole.mockReturnValue(true);
    await expect(setMemberSuspension({ status: "idle" }, form({ userId: ids.member, action: "SUSPEND", reason: "Spam" }))).resolves.toEqual({ status: "error", message: "Choose a suspension duration." });
  });
});

describe("administrator operations", () => {
  it("archives a space reversibly and records the operation", async () => {
    mocks.db.category.findUnique.mockResolvedValue({ id: ids.space, position: 1 });
    await expect(changeSpaceState({ status: "idle" }, form({ spaceId: ids.space, action: "ARCHIVE" }))).resolves.toEqual({ status: "success", message: "Space archived." });
    expect(mocks.db.category.update).toHaveBeenCalledWith({ where: { id: ids.space }, data: { archivedAt: expect.any(Date) } });
    expect(mocks.db.moderationAction.create).toHaveBeenCalledWith({ data: expect.objectContaining({ type: "ARCHIVE_SPACE" }) });
  });

  it("validates and saves operational moderation presets", async () => {
    const result = await saveModerationSettings({ status: "idle" }, form({
      reportReasons: "Spam\nOther", suspensionDurationsDays: "1, 7, 30", actionReasons: "Unsafe content\nOther",
    }));
    expect(result).toEqual({ status: "success", message: "Moderation presets saved." });
    expect(mocks.db.moderationSettings.upsert).toHaveBeenCalledWith({
      where: { id: "default" }, update: { reportReasons: ["Spam", "Other"], suspensionDurationsDays: [1, 7, 30], actionReasons: ["Unsafe content", "Other"] },
      create: { id: "default", reportReasons: ["Spam", "Other"], suspensionDurationsDays: [1, 7, 30], actionReasons: ["Unsafe content", "Other"] },
    });
    await expect(saveModerationSettings({ status: "idle" }, form({ reportReasons: "", suspensionDurationsDays: "0", actionReasons: "" }))).resolves.toEqual(expect.objectContaining({ status: "error" }));
  });

  it("creates and updates stable-slug spaces", async () => {
    mocks.db.category.findFirst.mockResolvedValue(null);
    mocks.db.category.findUnique.mockResolvedValue(null);
    mocks.db.category.aggregate.mockResolvedValue({ _max: { position: 2 } });
    mocks.db.category.upsert.mockResolvedValue({ id: ids.space, slug: "community-news" });
    const values = { name: "Community News", description: "Announcements and updates", color: "#336699", postingPolicy: "ANNOUNCEMENTS" };
    await expect(saveSpace({ status: "idle" }, form(values))).resolves.toEqual({ status: "success", message: "Space created." });
    expect(mocks.db.category.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ slug: "community-news", position: 3 }) }));

    mocks.db.category.findUnique.mockResolvedValue({ id: ids.space, slug: "community-news", position: 3 });
    mocks.db.category.upsert.mockResolvedValue({ id: ids.space, slug: "community-news" });
    await expect(saveSpace({ status: "idle" }, form({ ...values, spaceId: ids.space, name: "News" }))).resolves.toEqual({ status: "success", message: "Space updated." });
    expect(mocks.db.category.upsert).toHaveBeenLastCalledWith(expect.objectContaining({ update: expect.objectContaining({ name: "News" }) }));
  });

  it("restores and reorders spaces with neighboring positions", async () => {
    mocks.db.category.findUnique.mockResolvedValue({ id: ids.space, position: 2 });
    await expect(changeSpaceState({ status: "idle" }, form({ spaceId: ids.space, action: "RESTORE" }))).resolves.toEqual({ status: "success", message: "Space restored." });
    mocks.db.category.findFirst.mockResolvedValue({ id: "neighbor", position: 1 });
    await expect(changeSpaceState({ status: "idle" }, form({ spaceId: ids.space, action: "UP" }))).resolves.toEqual({ status: "success", message: "Space order updated." });
    expect(mocks.db.category.update).toHaveBeenCalledWith({ where: { id: ids.space }, data: { position: 1 } });
  });

  it("renames and merges tags while preserving the source URL", async () => {
    mocks.db.tag.findFirst.mockResolvedValue(null);
    mocks.db.tag.update.mockResolvedValue({ id: "tag-1", name: "Testing", slug: "tests" });
    await expect(renameTag({ status: "idle" }, form({ tagId: ids.target, name: "Testing" }))).resolves.toEqual({ status: "success", message: "Tag renamed; its URL remains unchanged." });

    mocks.db.tag.findUnique
      .mockResolvedValueOnce({ id: "source", name: "Old", slug: "old", threads: [{ threadId: "thread-1" }] })
      .mockResolvedValueOnce({ id: "destination", name: "New", slug: "new" });
    await expect(mergeTag({ status: "idle" }, form({ sourceId: ids.target, destinationId: ids.member }))).resolves.toEqual({ status: "success", message: "Tags merged and the old URL will redirect." });
    expect(mocks.db.tagAlias.upsert).toHaveBeenCalledWith({ where: { slug: "old" }, update: { tagId: "destination" }, create: { slug: "old", tagId: "destination" } });
    expect(mocks.db.tag.delete).toHaveBeenCalledWith({ where: { id: "source" } });
  });

  it("reports validation and lookup conflicts in administrator operations", async () => {
    await expect(saveSpace({ status: "idle" }, form({ name: "x", description: "x", color: "red", postingPolicy: "OPEN" }))).resolves.toEqual(expect.objectContaining({ status: "error" }));
    mocks.db.category.findFirst.mockResolvedValue({ id: "duplicate" });
    await expect(saveSpace({ status: "idle" }, form({ name: "General", description: "Community talk", color: "#336699", postingPolicy: "OPEN" }))).resolves.toEqual({ status: "error", message: "A space with that name already exists." });
    await expect(changeSpaceState({ status: "idle" }, form({ spaceId: "bad", action: "UP" }))).resolves.toEqual(expect.objectContaining({ status: "error" }));
    mocks.db.category.findUnique.mockResolvedValue(null);
    await expect(changeSpaceState({ status: "idle" }, form({ spaceId: ids.space, action: "UP" }))).resolves.toEqual({ status: "error", message: "Space not found." });
    mocks.db.category.findUnique.mockResolvedValue({ id: ids.space, position: 0 });
    mocks.db.category.findFirst.mockResolvedValue(null);
    await expect(changeSpaceState({ status: "idle" }, form({ spaceId: ids.space, action: "UP" }))).resolves.toEqual({ status: "error", message: "The space is already at the end of the list." });

    await expect(renameTag({ status: "idle" }, form({ tagId: "bad", name: "x" }))).resolves.toEqual(expect.objectContaining({ status: "error" }));
    mocks.db.tag.findFirst.mockResolvedValue({ id: "duplicate" });
    await expect(renameTag({ status: "idle" }, form({ tagId: ids.target, name: "Testing" }))).resolves.toEqual({ status: "error", message: "A tag with that name already exists. Merge the tags instead." });
    await expect(mergeTag({ status: "idle" }, form({ sourceId: ids.target, destinationId: ids.target }))).resolves.toEqual({ status: "error", message: "Choose two different tags." });
    mocks.db.tag.findUnique.mockResolvedValue(null);
    await expect(mergeTag({ status: "idle" }, form({ sourceId: ids.target, destinationId: ids.member }))).resolves.toEqual({ status: "error", message: "One of those tags no longer exists." });
  });
});
