-- Existing replies remain top-level because the new parent is nullable.
ALTER TABLE "Reply" ADD COLUMN "parentReplyId" TEXT;

CREATE INDEX "Reply_parentReplyId_status_createdAt_idx"
ON "Reply"("parentReplyId", "status", "createdAt");

ALTER TABLE "Reply"
ADD CONSTRAINT "Reply_parentReplyId_fkey"
FOREIGN KEY ("parentReplyId") REFERENCES "Reply"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
