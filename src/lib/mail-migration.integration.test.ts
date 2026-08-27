import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createTestUser } from "@/test/integration-factories";

describe("Mail migration result", () => {
  it("removes legacy private-content tables while preserving legacy moderation metadata and enabling Mail", async () => {
    const tables = await db.$queryRaw<Array<{ name: string }>>`
      SELECT table_name AS name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name IN ('Conversation', 'Message', 'MailThread', 'MailEntry', 'StaffMailboxThread')
      ORDER BY table_name
    `;
    expect(tables.map((item) => item.name)).toEqual(["MailEntry", "MailThread", "StaffMailboxThread"]);

    const [author, moderator] = await Promise.all([createTestUser(), createTestUser({ role: "MODERATOR" })]);
    const reportCase = await db.moderationCase.create({ data: { targetType: "LEGACY_MAIL", targetId: "removed-private-content" } });
    await db.staffNote.create({ data: { authorId: moderator.id, caseId: reportCase.id, body: "Preserved case note" } });
    await db.moderationAction.create({ data: { type: "ADD_NOTE", moderatorId: moderator.id, caseId: reportCase.id, targetType: "LEGACY_MAIL", targetId: "removed-private-content", reason: "Preserved action" } });
    expect(await db.moderationCase.findUniqueOrThrow({ where: { id: reportCase.id }, include: { notes: true, actions: true } })).toEqual(expect.objectContaining({ targetType: "LEGACY_MAIL", notes: [expect.objectContaining({ body: "Preserved case note" })], actions: [expect.objectContaining({ reason: "Preserved action" })] }));

    const thread = await db.mailThread.create({ data: { subject: "Usable schema", participants: { create: { userId: author.id } }, entries: { create: { authorId: author.id, body: "Mail works" } } } });
    expect(await db.mailEntry.count({ where: { threadId: thread.id } })).toBe(1);
  });
});
