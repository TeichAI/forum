-- Existing attachments are forum/public uploads. Mail has no files to preserve.
CREATE TYPE "AttachmentAccess" AS ENUM ('PUBLIC', 'PRIVATE');

ALTER TABLE "Attachment"
ADD COLUMN "access" "AttachmentAccess" NOT NULL DEFAULT 'PUBLIC';

CREATE INDEX "Attachment_access_context_targetId_idx"
ON "Attachment"("access", "context", "targetId");
