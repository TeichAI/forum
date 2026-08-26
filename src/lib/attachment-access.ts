import "server-only";

import type { AttachmentContext } from "@prisma/client";
import { getVerifiedUserRole } from "@/lib/auth";
import { db } from "@/lib/db";

type PrivateAttachment = {
  userId: string;
  context: AttachmentContext;
  targetId: string | null;
};

type Viewer = {
  id: string;
  clerkId: string;
  role: "MEMBER" | "MODERATOR" | "ADMIN";
};

export async function canAccessPrivateAttachment(attachment: PrivateAttachment, viewer: Viewer) {
  if ((attachment.context === "DRAFT" || attachment.context === "MAIL_DRAFT") && attachment.userId === viewer.id) {
    return true;
  }
  if (attachment.context !== "MAIL_ENTRY" || !attachment.targetId) return false;

  const participant = await db.mailEntry.findFirst({
    where: {
      id: attachment.targetId,
      thread: { participants: { some: { userId: viewer.id, removedAt: null } } },
    },
    select: { id: true },
  });
  if (participant) return true;

  if (viewer.role !== "MODERATOR" && viewer.role !== "ADMIN") return false;
  const verifiedRole = await getVerifiedUserRole(viewer);
  if (verifiedRole !== "MODERATOR" && verifiedRole !== "ADMIN") return false;
  return Boolean(await db.report.findFirst({
    where: { targetType: "MAIL_ENTRY", targetId: attachment.targetId },
    select: { id: true },
  }));
}
