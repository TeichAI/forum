import "server-only";

import type { AttachmentContext } from "@prisma/client";
import { db } from "@/lib/db";
import { uploadsEnabled } from "@/lib/upload-capability";

export async function claimAttachments(
  body: string,
  userId: string,
  context: Exclude<AttachmentContext, "DRAFT">,
  targetId: string,
  draftId?: string,
) {
  if (!uploadsEnabled()) return;
  const attachments = await db.attachment.findMany({
    where: {
      userId,
      OR: [
        { context: "DRAFT" },
        ...(draftId ? [{ context: "MAIL_DRAFT" as const, targetId: draftId }] : []),
      ],
    },
    select: { id: true, url: true },
  });
  const ids = attachments.filter((attachment) => body.includes(attachment.url)).map((attachment) => attachment.id);
  if (ids.length) {
    await db.attachment.updateMany({ where: { id: { in: ids } }, data: { context, targetId } });
  }
}
