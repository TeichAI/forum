import "server-only";

import type { AttachmentContext } from "@prisma/client";
import { canAccessMailEntry } from "@/lib/mail-access";

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

  return canAccessMailEntry(viewer, attachment.targetId, { allowReportedStaff: true });
}
