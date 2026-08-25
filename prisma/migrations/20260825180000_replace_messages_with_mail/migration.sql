-- Private chat content is intentionally not retained. Preserve moderation/audit rows
-- by moving legacy MESSAGE targets to a marker that has no content relation.
DELETE FROM "Notification" WHERE "type"::text = 'MESSAGE';
DELETE FROM "Attachment" WHERE "context"::text = 'MESSAGE';

ALTER TABLE "Report" ALTER COLUMN "targetType" TYPE TEXT USING
  CASE WHEN "targetType"::text = 'MESSAGE' THEN 'LEGACY_MAIL' ELSE "targetType"::text END;
ALTER TABLE "ModerationCase" ALTER COLUMN "targetType" TYPE TEXT USING
  CASE WHEN "targetType"::text = 'MESSAGE' THEN 'LEGACY_MAIL' ELSE "targetType"::text END;
ALTER TABLE "ModerationAction" ALTER COLUMN "targetType" TYPE TEXT USING
  CASE WHEN "targetType"::text = 'MESSAGE' THEN 'LEGACY_MAIL' ELSE "targetType"::text END;
DROP TYPE "ReportTargetType";
CREATE TYPE "ReportTargetType" AS ENUM ('THREAD', 'REPLY', 'USER', 'MAIL_ENTRY', 'LEGACY_MAIL', 'SPACE', 'TAG', 'SETTINGS', 'REPORT');
ALTER TABLE "Report" ALTER COLUMN "targetType" TYPE "ReportTargetType" USING "targetType"::"ReportTargetType";
ALTER TABLE "ModerationCase" ALTER COLUMN "targetType" TYPE "ReportTargetType" USING "targetType"::"ReportTargetType";
ALTER TABLE "ModerationAction" ALTER COLUMN "targetType" TYPE "ReportTargetType" USING "targetType"::"ReportTargetType";

ALTER TABLE "Notification" ALTER COLUMN "type" TYPE TEXT USING "type"::text;
DROP TYPE "NotificationType";
CREATE TYPE "NotificationType" AS ENUM ('REPLY', 'MENTION', 'UPVOTE', 'FOLLOW', 'MODERATION');
ALTER TABLE "Notification" ALTER COLUMN "type" TYPE "NotificationType" USING "type"::"NotificationType";

ALTER TABLE "Attachment" ALTER COLUMN "context" DROP DEFAULT;
ALTER TABLE "Attachment" ALTER COLUMN "context" TYPE TEXT USING "context"::text;
DROP TYPE "AttachmentContext";
CREATE TYPE "AttachmentContext" AS ENUM ('THREAD', 'REPLY', 'MAIL_ENTRY', 'MAIL_DRAFT', 'DRAFT');
ALTER TABLE "Attachment" ALTER COLUMN "context" TYPE "AttachmentContext" USING "context"::"AttachmentContext";
ALTER TABLE "Attachment" ALTER COLUMN "context" SET DEFAULT 'DRAFT';

ALTER TABLE "Notification" DROP COLUMN "conversationId", DROP COLUMN "messageId";
DROP TABLE "Message";
DROP TABLE "Conversation";

CREATE TYPE "MailLocation" AS ENUM ('INBOX', 'ARCHIVE', 'TRASH');

CREATE TABLE "MailThread" (
  "id" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MailThread_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MailEntry" (
  "id" TEXT NOT NULL,
  "threadId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MailEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MailParticipant" (
  "threadId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "location" "MailLocation" NOT NULL DEFAULT 'INBOX',
  "starred" BOOLEAN NOT NULL DEFAULT false,
  "lastReadAt" TIMESTAMP(3),
  "forcedUnread" BOOLEAN NOT NULL DEFAULT false,
  "removedAt" TIMESTAMP(3),
  CONSTRAINT "MailParticipant_pkey" PRIMARY KEY ("threadId", "userId")
);

CREATE TABLE "MailDraft" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "threadId" TEXT,
  "subject" TEXT NOT NULL DEFAULT '',
  "body" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MailDraft_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MailDraftRecipient" (
  "draftId" TEXT NOT NULL,
  "recipientId" TEXT NOT NULL,
  CONSTRAINT "MailDraftRecipient_pkey" PRIMARY KEY ("draftId", "recipientId")
);

CREATE INDEX "MailThread_lastActivityAt_id_idx" ON "MailThread"("lastActivityAt" DESC, "id");
CREATE INDEX "MailEntry_threadId_createdAt_idx" ON "MailEntry"("threadId", "createdAt");
CREATE INDEX "MailEntry_authorId_createdAt_idx" ON "MailEntry"("authorId", "createdAt" DESC);
CREATE INDEX "MailParticipant_userId_location_removedAt_idx" ON "MailParticipant"("userId", "location", "removedAt");
CREATE INDEX "MailParticipant_userId_starred_removedAt_idx" ON "MailParticipant"("userId", "starred", "removedAt");
CREATE INDEX "MailDraft_ownerId_updatedAt_idx" ON "MailDraft"("ownerId", "updatedAt" DESC);
CREATE INDEX "MailDraft_threadId_ownerId_idx" ON "MailDraft"("threadId", "ownerId");
CREATE INDEX "MailDraftRecipient_recipientId_idx" ON "MailDraftRecipient"("recipientId");

ALTER TABLE "MailEntry" ADD CONSTRAINT "MailEntry_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "MailThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MailEntry" ADD CONSTRAINT "MailEntry_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MailParticipant" ADD CONSTRAINT "MailParticipant_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "MailThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MailParticipant" ADD CONSTRAINT "MailParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MailDraft" ADD CONSTRAINT "MailDraft_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MailDraft" ADD CONSTRAINT "MailDraft_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "MailThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MailDraftRecipient" ADD CONSTRAINT "MailDraftRecipient_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "MailDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MailDraftRecipient" ADD CONSTRAINT "MailDraftRecipient_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
