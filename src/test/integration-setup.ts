import { afterAll, beforeEach } from "vitest";
import { db } from "@/lib/db";

beforeEach(async () => {
  await db.$executeRawUnsafe(`TRUNCATE TABLE
    "RateLimitBucket", "Attachment", "Block", "StaffNote", "Notification", "ModerationAction", "Report", "ModerationCase", "TagAlias", "ModerationSettings",
    "MailDraftRecipient", "MailDraft", "MailParticipant", "MailEntry", "MailThread", "Follow", "Bookmark", "ReplyVote",
    "ThreadVote", "Reply", "ThreadTag", "Thread", "Tag", "Category", "User"
    RESTART IDENTITY CASCADE`);
});

afterAll(async () => {
  await db.$disconnect();
});
