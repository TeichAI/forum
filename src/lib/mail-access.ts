import "server-only";

import { getVerifiedUserRole } from "@/lib/auth";
import { db } from "@/lib/db";
import type { ForumRole } from "@/lib/roles";

export type MailAccessViewer = {
  id: string;
  clerkId: string;
  role: ForumRole;
};

export async function isCurrentMailStaff(viewer: MailAccessViewer) {
  if (viewer.role !== "MODERATOR" && viewer.role !== "ADMIN") return false;
  const role = await getVerifiedUserRole(viewer);
  return role === "MODERATOR" || role === "ADMIN";
}

export async function getMailThreadAccess(viewer: MailAccessViewer, threadId: string) {
  const participant = await db.mailParticipant.findUnique({
    where: { threadId_userId: { threadId, userId: viewer.id } },
  });
  if (participant && !participant.removedAt) {
    return { kind: "personal" as const, state: participant };
  }

  const staffMailbox = await db.staffMailboxThread.findUnique({ where: { threadId } });
  if (!staffMailbox || staffMailbox.removedAt || !await isCurrentMailStaff(viewer)) return null;
  return { kind: "staff" as const, state: staffMailbox };
}

export async function canAccessMailEntry(
  viewer: MailAccessViewer,
  entryId: string,
  options: { allowReportedStaff?: boolean } = {},
) {
  const entry = await db.mailEntry.findUnique({ where: { id: entryId }, select: { threadId: true } });
  if (!entry) return false;
  if (await getMailThreadAccess(viewer, entry.threadId)) return true;
  if (!options.allowReportedStaff || !await isCurrentMailStaff(viewer)) return false;
  return Boolean(await db.report.findFirst({
    where: { targetType: "MAIL_ENTRY", targetId: entryId },
    select: { id: true },
  }));
}
