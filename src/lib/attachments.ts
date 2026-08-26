import "server-only";

import type { AttachmentContext, Prisma } from "@prisma/client";
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
  const attachments = await client.attachment.findMany({
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
    await client.attachment.updateMany({ where: { id: { in: ids } }, data: { context, targetId } });
  }
}
