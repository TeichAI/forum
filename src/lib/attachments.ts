import "server-only";

import type { AttachmentAccess, AttachmentContext, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { uploadsEnabled } from "@/lib/upload-capability";

export async function claimAttachments(
  body: string,
  userId: string,
  context: Exclude<AttachmentContext, "DRAFT">,
  targetId: string,
  draftId?: string,
  client: Pick<Prisma.TransactionClient, "attachment"> = db,
) {
  if (!uploadsEnabled()) return;
  const access: AttachmentAccess = context === "MAIL_ENTRY" || context === "MAIL_DRAFT" ? "PRIVATE" : "PUBLIC";
  const attachments = await client.attachment.findMany({
    where: {
      userId,
      access,
      OR: [
        { context: "DRAFT" },
        ...(access === "PRIVATE" && draftId ? [{ context: "MAIL_DRAFT" as const, targetId: draftId }] : []),
      ],
    },
    select: { id: true, url: true, access: true },
  });
  const ids = attachments
    .filter((attachment) => body.includes(attachment.access === "PRIVATE" ? `/api/attachments/${attachment.id}` : attachment.url))
    .map((attachment) => attachment.id);
  if (ids.length) {
    await client.attachment.updateMany({ where: { id: { in: ids } }, data: { context, targetId } });
  }
}
