-- CreateTable
CREATE TABLE "StaffMailboxThread" (
    "threadId" TEXT NOT NULL,
    "location" "MailLocation" NOT NULL DEFAULT 'INBOX',
    "starred" BOOLEAN NOT NULL DEFAULT false,
    "lastReadAt" TIMESTAMP(3),
    "forcedUnread" BOOLEAN NOT NULL DEFAULT false,
    "removedAt" TIMESTAMP(3),

    CONSTRAINT "StaffMailboxThread_pkey" PRIMARY KEY ("threadId")
);

-- AlterTable
ALTER TABLE "MailDraft" ADD COLUMN "staffMailbox" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "StaffMailboxThread_location_removedAt_threadId_idx" ON "StaffMailboxThread"("location", "removedAt", "threadId");

-- CreateIndex
CREATE INDEX "StaffMailboxThread_starred_removedAt_idx" ON "StaffMailboxThread"("starred", "removedAt");

-- AddForeignKey
ALTER TABLE "StaffMailboxThread" ADD CONSTRAINT "StaffMailboxThread_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "MailThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
