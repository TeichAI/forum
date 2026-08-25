import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@prisma/client";

const authState = vi.hoisted(() => ({ staff: null as User | null, admin: null as User | null }));
vi.mock("@/lib/auth", () => ({
  requireModerator: vi.fn(async () => authState.staff),
  requireAdmin: vi.fn(async () => authState.admin ?? authState.staff),
  getVerifiedUserRole: vi.fn(async (user: User) => user.role),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  addStaffNote, changeSpaceState, claimCase, closeCase, mergeTag, moderateContent, renameTag,
  saveModerationSettings, saveSpace, setCasePriority, setMemberSuspension, type StaffActionState,
} from "./staff";
import { db } from "@/lib/db";
import { createTestCategory, createTestThread, createTestUser } from "@/test/integration-factories";

const initial: StaffActionState = { status: "idle" };
function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

beforeEach(() => { authState.staff = null; authState.admin = null; });

describe("staff workflows against PostgreSQL", () => {
  it("claims, annotates, and resolves a durable moderation case", async () => {
    const [moderator, reporter, author] = await Promise.all([createTestUser({ role: "MODERATOR" }), createTestUser(), createTestUser()]);
    const category = await createTestCategory();
    const thread = await createTestThread(author.id, category.id);
    const reportCase = await db.moderationCase.create({ data: { targetType: "THREAD", targetId: thread.id, reports: { create: { reporterId: reporter.id, targetType: "THREAD", targetId: thread.id, reason: "Spam" } } } });
    authState.staff = moderator;

    await expect(claimCase(initial, form({ caseId: reportCase.id }))).resolves.toEqual(expect.objectContaining({ status: "success" }));
    await expect(addStaffNote(initial, form({ caseId: reportCase.id, body: "Corroborated by the linked thread." }))).resolves.toEqual(expect.objectContaining({ status: "success" }));
    await expect(closeCase(initial, form({ caseId: reportCase.id, decision: "RESOLVED", reason: "Confirmed spam" }))).resolves.toEqual(expect.objectContaining({ status: "success" }));

    expect(await db.moderationCase.findUnique({ where: { id: reportCase.id } })).toEqual(expect.objectContaining({ status: "RESOLVED", assignedToId: moderator.id, resolution: "Confirmed spam" }));
    expect(await db.staffNote.findFirst({ where: { caseId: reportCase.id } })).toEqual(expect.objectContaining({ authorId: moderator.id, body: "Corroborated by the linked thread." }));
    expect(await db.moderationAction.count({ where: { caseId: reportCase.id } })).toBe(3);

    await expect(closeCase(initial, form({ caseId: reportCase.id, decision: "REOPEN", reason: "New evidence" }))).resolves.toEqual({ status: "success", message: "Case reopened." });
    await expect(setCasePriority(initial, form({ caseId: reportCase.id, priority: "URGENT" }))).resolves.toEqual({ status: "success", message: "Priority updated." });
    await expect(closeCase(initial, form({ caseId: reportCase.id, decision: "DISMISSED", reason: "Report disproved" }))).resolves.toEqual({ status: "success", message: "Case dismissed." });

    expect(await db.moderationCase.findUnique({ where: { id: reportCase.id } })).toEqual(expect.objectContaining({
      status: "DISMISSED", priority: "URGENT", resolution: "Report disproved", assignedToId: moderator.id,
    }));
    expect(await db.moderationAction.findMany({ where: { caseId: reportCase.id }, orderBy: { createdAt: "asc" }, select: { type: true } })).toEqual([
      { type: "CLAIM_REPORT" }, { type: "ADD_NOTE" }, { type: "RESOLVE_REPORT" },
      { type: "REOPEN_REPORT" }, { type: "SET_PRIORITY" }, { type: "DISMISS_REPORT" },
    ]);
  });

  it("allows only one of two moderators to claim an unassigned case", async () => {
    const [first, second, reporter, author] = await Promise.all([
      createTestUser({ role: "MODERATOR" }), createTestUser({ role: "MODERATOR" }), createTestUser(), createTestUser(),
    ]);
    const category = await createTestCategory();
    const thread = await createTestThread(author.id, category.id);
    const reportCase = await db.moderationCase.create({ data: {
      targetType: "THREAD", targetId: thread.id,
      reports: { create: { reporterId: reporter.id, targetType: "THREAD", targetId: thread.id, reason: "Spam" } },
    } });

    authState.staff = first;
    const firstClaim = claimCase(initial, form({ caseId: reportCase.id }));
    authState.staff = second;
    const secondClaim = claimCase(initial, form({ caseId: reportCase.id }));
    const results = await Promise.all([firstClaim, secondClaim]);

    expect(results.filter((result) => result.status === "success")).toHaveLength(1);
    expect(results.filter((result) => result.status === "error")).toEqual([
      { status: "error", message: "This case is already assigned to another staff member." },
    ]);
    const stored = await db.moderationCase.findUniqueOrThrow({ where: { id: reportCase.id } });
    expect([first.id, second.id]).toContain(stored.assignedToId);
    expect(await db.moderationAction.count({ where: { caseId: reportCase.id, type: "CLAIM_REPORT" } })).toBe(1);
  });

  it("moderates real content and member access with linked notices", async () => {
    const [moderator, member] = await Promise.all([createTestUser({ role: "MODERATOR" }), createTestUser()]);
    const category = await createTestCategory();
    const thread = await createTestThread(member.id, category.id);
    authState.staff = moderator;

    const reply = await db.reply.create({ data: { body: "A reply to moderate", authorId: member.id, threadId: thread.id } });
    for (const action of ["HIDE", "RESTORE", "LOCK", "UNLOCK", "PIN", "UNPIN"] as const) {
      await expect(moderateContent(initial, form({ targetType: "THREAD", targetId: thread.id, action, reason: `Thread ${action.toLowerCase()}` }))).resolves.toEqual(expect.objectContaining({ status: "success" }));
    }
    for (const action of ["HIDE", "RESTORE"] as const) {
      await expect(moderateContent(initial, form({ targetType: "REPLY", targetId: reply.id, action, reason: `Reply ${action.toLowerCase()}` }))).resolves.toEqual(expect.objectContaining({ status: "success" }));
    }
    await setMemberSuspension(initial, form({ userId: member.id, action: "SUSPEND", days: "7", reason: "Repeated violations" }));

    expect(await db.thread.findUnique({ where: { id: thread.id } })).toEqual(expect.objectContaining({ status: "PUBLISHED", isLocked: false, isPinned: false }));
    expect(await db.reply.findUnique({ where: { id: reply.id } })).toEqual(expect.objectContaining({ status: "PUBLISHED" }));
    expect(await db.user.findUnique({ where: { id: member.id } })).toEqual(expect.objectContaining({ status: "SUSPENDED", suspendedUntil: expect.any(Date) }));
    const notices = await db.notification.findMany({ where: { recipientId: member.id, type: "MODERATION" } });
    expect(notices).toHaveLength(9);
    expect(notices.every((notice) => Boolean(notice.moderationActionId))).toBe(true);

    await expect(setMemberSuspension(initial, form({ userId: member.id, action: "UNSUSPEND", reason: "Appeal accepted" }))).resolves.toEqual({ status: "success", message: "Member restored." });
    expect(await db.user.findUnique({ where: { id: member.id } })).toEqual(expect.objectContaining({ status: "ACTIVE", suspendedUntil: null, suspensionReason: null }));
  });

  it("refuses to moderate or reactivate a deleted account", async () => {
    const [moderator, deleted] = await Promise.all([
      createTestUser({ role: "MODERATOR" }),
      createTestUser({ status: "DELETED", deletedAt: new Date() }),
    ]);
    authState.staff = moderator;

    await expect(setMemberSuspension(initial, form({ userId: deleted.id, action: "UNSUSPEND", reason: "Restore access" }))).resolves.toEqual({
      status: "error", message: "Deleted accounts cannot be moderated.",
    });
    await expect(addStaffNote(initial, form({ userId: deleted.id, body: "Should not be saved" }))).resolves.toEqual({
      status: "error", message: "Deleted accounts cannot be moderated.",
    });
    expect(await db.user.findUniqueOrThrow({ where: { id: deleted.id } })).toEqual(expect.objectContaining({ status: "DELETED" }));
    expect(await db.staffNote.count({ where: { userId: deleted.id } })).toBe(0);
    expect(await db.moderationAction.count({ where: { userId: deleted.id } })).toBe(0);
  });

  it("rolls back account state and audit data when notification creation fails", async () => {
    const [moderator, member] = await Promise.all([createTestUser({ role: "MODERATOR" }), createTestUser()]);
    authState.staff = moderator;
    await db.$executeRawUnsafe(`CREATE FUNCTION reject_moderation_notice() RETURNS trigger AS $$ BEGIN IF NEW.type = 'MODERATION' THEN RAISE EXCEPTION 'test notification failure'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`);
    await db.$executeRawUnsafe(`CREATE TRIGGER reject_moderation_notice BEFORE INSERT ON "Notification" FOR EACH ROW EXECUTE FUNCTION reject_moderation_notice()`);
    try {
      await expect(setMemberSuspension(initial, form({ userId: member.id, action: "SUSPEND", days: "7", reason: "Rollback test" }))).rejects.toThrow();
    } finally {
      await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS reject_moderation_notice ON "Notification"`);
      await db.$executeRawUnsafe(`DROP FUNCTION IF EXISTS reject_moderation_notice()`);
    }

    expect(await db.user.findUniqueOrThrow({ where: { id: member.id } })).toEqual(expect.objectContaining({ status: "ACTIVE", suspendedUntil: null }));
    expect(await db.moderationAction.count({ where: { userId: member.id } })).toBe(0);
  });

  it("archives spaces and persists validated admin presets", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const category = await createTestCategory();
    authState.staff = admin;
    authState.admin = admin;

    await changeSpaceState(initial, form({ spaceId: category.id, action: "ARCHIVE" }));
    await saveModerationSettings(initial, form({ reportReasons: "Spam\nOther", suspensionDurationsDays: "3, 14", actionReasons: "Spam\nOther" }));

    expect(await db.category.findUnique({ where: { id: category.id } })).toEqual(expect.objectContaining({ archivedAt: expect.any(Date) }));
    expect(await db.moderationSettings.findUnique({ where: { id: "default" } })).toEqual(expect.objectContaining({ reportReasons: ["Spam", "Other"], suspensionDurationsDays: [3, 14] }));
  });

  it("creates, updates, reorders, archives, and restores spaces with audit records", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    authState.staff = admin;
    authState.admin = admin;
    const first = await createTestCategory({ name: "First", position: 0 });

    await expect(saveSpace(initial, form({ name: "Community News", description: "Announcements and updates", color: "#336699", postingPolicy: "ANNOUNCEMENTS" }))).resolves.toEqual({ status: "success", message: "Space created." });
    const created = await db.category.findUniqueOrThrow({ where: { name: "Community News" } });
    expect(created).toEqual(expect.objectContaining({ slug: "community-news", color: "#336699", position: 1, postingPolicy: "ANNOUNCEMENTS" }));

    await expect(saveSpace(initial, form({ spaceId: created.id, name: "Community Updates", description: "Updated description", color: "#ABCDEF", postingPolicy: "ADMIN_ONLY" }))).resolves.toEqual({ status: "success", message: "Space updated." });
    await expect(changeSpaceState(initial, form({ spaceId: created.id, action: "UP" }))).resolves.toEqual(expect.objectContaining({ status: "success" }));
    expect(await db.category.findUniqueOrThrow({ where: { id: created.id } })).toEqual(expect.objectContaining({ slug: "community-news", name: "Community Updates", color: "#abcdef", position: 0 }));
    expect(await db.category.findUniqueOrThrow({ where: { id: first.id } })).toEqual(expect.objectContaining({ position: 1 }));

    await changeSpaceState(initial, form({ spaceId: created.id, action: "ARCHIVE" }));
    await changeSpaceState(initial, form({ spaceId: created.id, action: "RESTORE" }));
    expect(await db.category.findUniqueOrThrow({ where: { id: created.id } })).toEqual(expect.objectContaining({ archivedAt: null }));
    expect(await db.moderationAction.findMany({ where: { targetId: created.id }, orderBy: { createdAt: "asc" }, select: { type: true } })).toEqual([
      { type: "CREATE_SPACE" }, { type: "UPDATE_SPACE" }, { type: "REORDER_SPACE" }, { type: "ARCHIVE_SPACE" }, { type: "RESTORE_SPACE" },
    ]);
  });

  it("renames and merges tags while preserving threads and old URLs", async () => {
    const [admin, member] = await Promise.all([createTestUser({ role: "ADMIN" }), createTestUser()]);
    authState.staff = admin;
    authState.admin = admin;
    const category = await createTestCategory();
    const thread = await createTestThread(member.id, category.id);
    const [source, destination] = await Promise.all([
      db.tag.create({ data: { name: "Type Script", slug: "type-script", threads: { create: { threadId: thread.id } } } }),
      db.tag.create({ data: { name: "TypeScript", slug: "typescript" } }),
    ]);

    await expect(renameTag(initial, form({ tagId: source.id, name: "Type Script Legacy" }))).resolves.toEqual(expect.objectContaining({ status: "success" }));
    await expect(mergeTag(initial, form({ sourceId: source.id, destinationId: destination.id }))).resolves.toEqual(expect.objectContaining({ status: "success" }));

    expect(await db.tag.findUnique({ where: { id: source.id } })).toBeNull();
    expect(await db.threadTag.findUnique({ where: { threadId_tagId: { threadId: thread.id, tagId: destination.id } } })).not.toBeNull();
    expect(await db.tagAlias.findUnique({ where: { slug: "type-script" } })).toEqual(expect.objectContaining({ tagId: destination.id }));
    expect(await db.moderationAction.findMany({ where: { moderatorId: admin.id, type: { in: ["RENAME_TAG", "MERGE_TAG"] } }, select: { type: true } })).toHaveLength(2);
  });
});
