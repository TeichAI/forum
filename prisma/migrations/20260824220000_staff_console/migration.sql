ALTER TYPE "ReportStatus" ADD VALUE IF NOT EXISTS 'IN_REVIEW';
ALTER TYPE "ReportTargetType" ADD VALUE IF NOT EXISTS 'SPACE';
ALTER TYPE "ReportTargetType" ADD VALUE IF NOT EXISTS 'TAG';
ALTER TYPE "ReportTargetType" ADD VALUE IF NOT EXISTS 'SETTINGS';
ALTER TYPE "ReportTargetType" ADD VALUE IF NOT EXISTS 'REPORT';
ALTER TYPE "ModerationActionType" ADD VALUE IF NOT EXISTS 'REOPEN_REPORT';
ALTER TYPE "ModerationActionType" ADD VALUE IF NOT EXISTS 'CLAIM_REPORT';
ALTER TYPE "ModerationActionType" ADD VALUE IF NOT EXISTS 'UNCLAIM_REPORT';
ALTER TYPE "ModerationActionType" ADD VALUE IF NOT EXISTS 'SET_PRIORITY';
ALTER TYPE "ModerationActionType" ADD VALUE IF NOT EXISTS 'PIN';
ALTER TYPE "ModerationActionType" ADD VALUE IF NOT EXISTS 'UNPIN';
ALTER TYPE "ModerationActionType" ADD VALUE IF NOT EXISTS 'ADD_NOTE';
ALTER TYPE "ModerationActionType" ADD VALUE IF NOT EXISTS 'CREATE_SPACE';
ALTER TYPE "ModerationActionType" ADD VALUE IF NOT EXISTS 'UPDATE_SPACE';
ALTER TYPE "ModerationActionType" ADD VALUE IF NOT EXISTS 'ARCHIVE_SPACE';
ALTER TYPE "ModerationActionType" ADD VALUE IF NOT EXISTS 'RESTORE_SPACE';
ALTER TYPE "ModerationActionType" ADD VALUE IF NOT EXISTS 'REORDER_SPACE';
ALTER TYPE "ModerationActionType" ADD VALUE IF NOT EXISTS 'RENAME_TAG';
ALTER TYPE "ModerationActionType" ADD VALUE IF NOT EXISTS 'MERGE_TAG';
ALTER TYPE "ModerationActionType" ADD VALUE IF NOT EXISTS 'UPDATE_MODERATION_SETTINGS';

CREATE TYPE "ReportPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

ALTER TABLE "Category" ADD COLUMN "archivedAt" TIMESTAMP(3);

CREATE TABLE "ModerationCase" (
  "id" TEXT NOT NULL,
  "targetType" "ReportTargetType" NOT NULL,
  "targetId" TEXT NOT NULL,
  "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
  "priority" "ReportPriority" NOT NULL DEFAULT 'NORMAL',
  "assignedToId" TEXT,
  "resolution" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "closedAt" TIMESTAMP(3),
  CONSTRAINT "ModerationCase_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ModerationCase"
  ADD CONSTRAINT "ModerationCase_assignedToId_fkey"
  FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "ModerationCase_status_priority_createdAt_idx" ON "ModerationCase"("status", "priority", "createdAt");
CREATE INDEX "ModerationCase_assignedToId_status_idx" ON "ModerationCase"("assignedToId", "status");
CREATE INDEX "ModerationCase_targetType_targetId_status_idx" ON "ModerationCase"("targetType", "targetId", "status");

INSERT INTO "ModerationCase" (
  "id", "targetType", "targetId", "status", "assignedToId", "resolution", "createdAt", "updatedAt", "closedAt"
)
SELECT
  "id", "targetType", "targetId", "status", "reviewedById", "resolution", "createdAt",
  COALESCE("reviewedAt", "createdAt"), "reviewedAt"
FROM "Report";

ALTER TABLE "Report" ADD COLUMN "caseId" TEXT;
UPDATE "Report" SET "caseId" = "id";
ALTER TABLE "Report" ALTER COLUMN "caseId" SET NOT NULL;
ALTER TABLE "Report" DROP CONSTRAINT IF EXISTS "Report_reviewedById_fkey";
DROP INDEX IF EXISTS "Report_status_createdAt_idx";
ALTER TABLE "Report" DROP COLUMN "status", DROP COLUMN "reviewedById", DROP COLUMN "resolution", DROP COLUMN "reviewedAt";
ALTER TABLE "Report"
  ADD CONSTRAINT "Report_caseId_fkey"
  FOREIGN KEY ("caseId") REFERENCES "ModerationCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "Report_caseId_createdAt_idx" ON "Report"("caseId", "createdAt");

CREATE TABLE "StaffNote" (
  "id" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "caseId" TEXT,
  "userId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StaffNote_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "StaffNote" ADD CONSTRAINT "StaffNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StaffNote" ADD CONSTRAINT "StaffNote_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "ModerationCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StaffNote" ADD CONSTRAINT "StaffNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "StaffNote_caseId_createdAt_idx" ON "StaffNote"("caseId", "createdAt");
CREATE INDEX "StaffNote_userId_createdAt_idx" ON "StaffNote"("userId", "createdAt");

CREATE TABLE "ModerationSettings" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "reportReasons" TEXT[] DEFAULT ARRAY['Spam', 'Harassment', 'Unsafe content', 'Off topic', 'Other']::TEXT[],
  "suspensionDurationsDays" INTEGER[] DEFAULT ARRAY[1, 3, 7, 30, 90]::INTEGER[],
  "actionReasons" TEXT[] DEFAULT ARRAY['Spam', 'Harassment', 'Unsafe content', 'Off topic', 'Repeated violations', 'Other']::TEXT[],
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ModerationSettings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "ModerationSettings" ("id", "updatedAt") VALUES ('default', CURRENT_TIMESTAMP);

CREATE TABLE "TagAlias" (
  "slug" TEXT NOT NULL,
  "tagId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TagAlias_pkey" PRIMARY KEY ("slug")
);
ALTER TABLE "TagAlias" ADD CONSTRAINT "TagAlias_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "TagAlias_tagId_idx" ON "TagAlias"("tagId");

ALTER TABLE "ModerationAction" ADD COLUMN "caseId" TEXT;
ALTER TABLE "ModerationAction" ADD CONSTRAINT "ModerationAction_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "ModerationCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "ModerationAction_caseId_createdAt_idx" ON "ModerationAction"("caseId", "createdAt" DESC);

ALTER TABLE "Notification" ADD COLUMN "moderationActionId" TEXT;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_moderationActionId_fkey" FOREIGN KEY ("moderationActionId") REFERENCES "ModerationAction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
