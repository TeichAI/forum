CREATE INDEX "Thread_status_bumpedAt_id_idx" ON "Thread"("status", "bumpedAt" DESC, "id" DESC);
CREATE INDEX "Thread_categoryId_status_bumpedAt_id_idx" ON "Thread"("categoryId", "status", "bumpedAt" DESC, "id" DESC);
CREATE INDEX "Reply_threadId_parentReplyId_status_createdAt_id_idx" ON "Reply"("threadId", "parentReplyId", "status", "createdAt", "id");
CREATE INDEX "Reply_threadId_parentReplyId_createdAt_id_idx" ON "Reply"("threadId", "parentReplyId", "createdAt", "id");
CREATE INDEX "MailParticipant_userId_location_removedAt_threadId_idx" ON "MailParticipant"("userId", "location", "removedAt", "threadId");
CREATE INDEX "Notification_recipientId_createdAt_id_idx" ON "Notification"("recipientId", "createdAt" DESC, "id" DESC);
CREATE INDEX "ModerationCase_status_priority_createdAt_id_idx" ON "ModerationCase"("status", "priority", "createdAt", "id");
CREATE INDEX "Attachment_context_createdAt_idx" ON "Attachment"("context", "createdAt");

-- Concurrent reports created before this constraint may have produced more than
-- one active case for the same target. Preserve the oldest case and move all
-- related history onto it before enforcing the invariant.
WITH active_cases AS (
  SELECT "id", FIRST_VALUE("id") OVER (
    PARTITION BY "targetType", "targetId"
    ORDER BY "createdAt", "id"
  ) AS keeper_id
  FROM "ModerationCase"
  WHERE "status" IN ('OPEN', 'IN_REVIEW')
)
UPDATE "Report" AS report
SET "caseId" = active_cases.keeper_id
FROM active_cases
WHERE report."caseId" = active_cases."id"
  AND active_cases."id" <> active_cases.keeper_id;

WITH active_cases AS (
  SELECT "id", FIRST_VALUE("id") OVER (
    PARTITION BY "targetType", "targetId"
    ORDER BY "createdAt", "id"
  ) AS keeper_id
  FROM "ModerationCase"
  WHERE "status" IN ('OPEN', 'IN_REVIEW')
)
UPDATE "StaffNote" AS note
SET "caseId" = active_cases.keeper_id
FROM active_cases
WHERE note."caseId" = active_cases."id"
  AND active_cases."id" <> active_cases.keeper_id;

WITH active_cases AS (
  SELECT "id", FIRST_VALUE("id") OVER (
    PARTITION BY "targetType", "targetId"
    ORDER BY "createdAt", "id"
  ) AS keeper_id
  FROM "ModerationCase"
  WHERE "status" IN ('OPEN', 'IN_REVIEW')
)
UPDATE "ModerationAction" AS action
SET "caseId" = active_cases.keeper_id
FROM active_cases
WHERE action."caseId" = active_cases."id"
  AND active_cases."id" <> active_cases.keeper_id;

WITH active_cases AS (
  SELECT "id", FIRST_VALUE("id") OVER (
    PARTITION BY "targetType", "targetId"
    ORDER BY "createdAt", "id"
  ) AS keeper_id
  FROM "ModerationCase"
  WHERE "status" IN ('OPEN', 'IN_REVIEW')
)
DELETE FROM "ModerationCase" AS duplicate
USING active_cases
WHERE duplicate."id" = active_cases."id"
  AND active_cases."id" <> active_cases.keeper_id;

CREATE UNIQUE INDEX "ModerationCase_active_target_key"
ON "ModerationCase"("targetType", "targetId")
WHERE "status" IN ('OPEN', 'IN_REVIEW');
