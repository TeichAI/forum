import { afterAll, beforeEach } from "vitest";
import { db } from "@/lib/db";

beforeEach(async () => {
  await db.$executeRawUnsafe(`TRUNCATE TABLE
    "Attachment", "Block", "StaffNote", "Notification", "ModerationAction", "Report", "ModerationCase", "TagAlias", "ModerationSettings",
    "Message", "Conversation", "Follow", "Bookmark", "ReplyVote",
    "ThreadVote", "Reply", "ThreadTag", "Thread", "Tag", "Category", "User"
    RESTART IDENTITY CASCADE`);
});

afterAll(async () => {
  await db.$disconnect();
});
