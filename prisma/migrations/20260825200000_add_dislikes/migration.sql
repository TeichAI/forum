CREATE TABLE "ThreadDislike" (
    "userId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ThreadDislike_pkey" PRIMARY KEY ("userId", "threadId")
);

CREATE TABLE "ReplyDislike" (
    "userId" TEXT NOT NULL,
    "replyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReplyDislike_pkey" PRIMARY KEY ("userId", "replyId")
);

CREATE INDEX "ThreadDislike_threadId_idx" ON "ThreadDislike"("threadId");
CREATE INDEX "ReplyDislike_replyId_idx" ON "ReplyDislike"("replyId");

ALTER TABLE "ThreadDislike"
ADD CONSTRAINT "ThreadDislike_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ThreadDislike"
ADD CONSTRAINT "ThreadDislike_threadId_fkey"
FOREIGN KEY ("threadId") REFERENCES "Thread"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReplyDislike"
ADD CONSTRAINT "ReplyDislike_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReplyDislike"
ADD CONSTRAINT "ReplyDislike_replyId_fkey"
FOREIGN KEY ("replyId") REFERENCES "Reply"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
