import { PrismaClient } from "@prisma/client";

export const staffIds = {
  member: "cm200000000000000000000001",
  reporter: "cm200000000000000000000002",
  moderator: "cm200000000000000000000003",
  admin: "cm200000000000000000000004",
  protectedModerator: "cm200000000000000000000005",
  deleted: "cm200000000000000000000006",
  category: "cm200000000000000000000007",
  thread: "cm200000000000000000000008",
  reply: "cm200000000000000000000009",
  threadCase: "cm200000000000000000000010",
  memberCase: "cm200000000000000000000011",
  protectedCase: "cm200000000000000000000012",
  messageCase: "cm200000000000000000000013",
  mailThread: "cm200000000000000000000014",
  mailEntry: "cm200000000000000000000015",
  sourceTag: "cm200000000000000000000016",
  destinationTag: "cm200000000000000000000017",
};

export default async function staffGlobalSetup() {
  if (process.env.E2E_TEST_MODE !== "1" || !process.env.DATABASE_URL?.includes("test")) {
    throw new Error("Staff E2E requires guarded test mode and a test database");
  }

  const db = new PrismaClient();
  await db.user.createMany({ data: [
    { id: staffIds.member, clerkId: "staff_e2e_member", email: "member@staff.test", username: "staff_member", displayName: "Staff Test Member" },
    { id: staffIds.reporter, clerkId: "staff_e2e_reporter", email: "reporter@staff.test", username: "staff_reporter", displayName: "Staff Reporter" },
    { id: staffIds.moderator, clerkId: "staff_e2e_moderator", email: "moderator@staff.test", username: "staff_moderator", displayName: "Staff Moderator", role: "MODERATOR" },
    { id: staffIds.admin, clerkId: "staff_e2e_admin", email: "admin@staff.test", username: "staff_admin", displayName: "Staff Administrator", role: "ADMIN" },
    { id: staffIds.protectedModerator, clerkId: "staff_e2e_protected", email: "protected@staff.test", username: "protected_mod", displayName: "Protected Moderator", role: "MODERATOR" },
    { id: staffIds.deleted, clerkId: "staff_e2e_deleted", email: "deleted@staff.test", username: "deleted_member", displayName: "Deleted Member", status: "DELETED", deletedAt: new Date() },
  ] });

  await db.category.create({ data: {
    id: staffIds.category, name: "Staff Test General", slug: "staff-test-general",
    description: "Seeded content for the isolated staff console suite.", position: 0,
  } });
  await db.tag.createMany({ data: [
    { id: staffIds.sourceTag, name: "Legacy Topic", slug: "legacy-topic" },
    { id: staffIds.destinationTag, name: "Canonical Topic", slug: "canonical-topic" },
  ] });
  await db.thread.create({ data: {
    id: staffIds.thread, slug: "staff-browser-reported-thread", title: "Staff browser reported thread",
    body: "This seeded discussion exercises every staff moderation transition.",
    authorId: staffIds.member, categoryId: staffIds.category,
    tags: { create: { tagId: staffIds.sourceTag } },
  } });
  await db.reply.create({ data: {
    id: staffIds.reply, body: "A seeded reply for staff review.", threadId: staffIds.thread, authorId: staffIds.member,
  } });
  await db.mailThread.create({ data: {
    id: staffIds.mailThread, subject: "Reported private mail",
    participants: { create: [{ userId: staffIds.member }, { userId: staffIds.reporter }] },
    entries: { create: { id: staffIds.mailEntry, authorId: staffIds.member, body: "A private seeded Mail entry with deliberately limited staff context." } },
  } });

  await db.moderationCase.create({ data: {
    id: staffIds.threadCase, targetType: "THREAD", targetId: staffIds.thread, priority: "HIGH",
    reports: { create: [
      { reporterId: staffIds.reporter, targetType: "THREAD", targetId: staffIds.thread, reason: "Unsafe content", details: "Seeded browser report details." },
      { reporterId: staffIds.moderator, targetType: "THREAD", targetId: staffIds.thread, reason: "Spam", details: "A second report groups into the case." },
    ] },
  } });
  await db.moderationCase.create({ data: {
    id: staffIds.memberCase, targetType: "USER", targetId: staffIds.member,
    reports: { create: { reporterId: staffIds.reporter, targetType: "USER", targetId: staffIds.member, reason: "Harassment", details: "Review this member account." } },
  } });
  await db.moderationCase.create({ data: {
    id: staffIds.protectedCase, targetType: "USER", targetId: staffIds.protectedModerator,
    reports: { create: { reporterId: staffIds.reporter, targetType: "USER", targetId: staffIds.protectedModerator, reason: "Other", details: "Role hierarchy regression case." } },
  } });
  await db.moderationCase.create({ data: {
    id: staffIds.messageCase, targetType: "MAIL_ENTRY", targetId: staffIds.mailEntry,
    reports: { create: { reporterId: staffIds.reporter, targetType: "MAIL_ENTRY", targetId: staffIds.mailEntry, reason: "Harassment", details: "Private-Mail report." } },
  } });

  await db.moderationAction.createMany({ data: [
    { type: "HIDE", moderatorId: staffIds.moderator, userId: staffIds.member, targetType: "REPLY", targetId: staffIds.reply, reason: "Seeded moderator audit event" },
    { type: "CREATE_SPACE", moderatorId: staffIds.admin, targetType: "SPACE", targetId: staffIds.category, reason: "Seeded administrative audit event" },
  ] });
  await db.$disconnect();
}
