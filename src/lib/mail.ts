import "server-only";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export const MAIL_FOLDERS = ["inbox", "starred", "sent", "drafts", "archive", "trash"] as const;
export type MailFolder = (typeof MAIL_FOLDERS)[number];

export function normalizeMailFolder(value: unknown): MailFolder {
  return typeof value === "string" && MAIL_FOLDERS.includes(value as MailFolder) ? value as MailFolder : "inbox";
}

export function isMailUnread(participant: { forcedUnread: boolean; lastReadAt: Date | null; thread: { lastActivityAt: Date } }) {
  return participant.forcedUnread || !participant.lastReadAt || participant.lastReadAt < participant.thread.lastActivityAt;
}

export const mailThreadInclude = {
  participants: {
    include: { user: { select: { id: true, username: true, displayName: true, imageUrl: true, role: true, status: true } } },
  },
  entries: {
    orderBy: { createdAt: "desc" as const },
    take: 1,
    include: { author: { select: { id: true, username: true, displayName: true, imageUrl: true, role: true } } },
  },
} satisfies Prisma.MailThreadInclude;

function participantWhere(userId: string, folder: Exclude<MailFolder, "drafts">): Prisma.MailParticipantWhereInput {
  const base: Prisma.MailParticipantWhereInput = { userId, removedAt: null };
  if (folder === "starred") return { ...base, starred: true, location: { not: "TRASH" } };
  if (folder === "sent") return { ...base, location: { not: "TRASH" }, thread: { entries: { some: { authorId: userId } } } };
  return { ...base, location: folder === "archive" ? "ARCHIVE" : folder === "trash" ? "TRASH" : "INBOX" };
}

export async function getMailCounts(userId: string) {
  const [participants, drafts] = await Promise.all([
    db.mailParticipant.findMany({
      where: { userId, removedAt: null },
      select: { location: true, starred: true, lastReadAt: true, forcedUnread: true, thread: { select: { lastActivityAt: true, entries: { where: { authorId: userId }, take: 1, select: { id: true } } } } },
    }),
    db.mailDraft.count({ where: { ownerId: userId } }),
  ]);
  return {
    inbox: participants.filter((item) => item.location === "INBOX").length,
    unread: participants.filter((item) => item.location === "INBOX" && isMailUnread(item)).length,
    starred: participants.filter((item) => item.starred && item.location !== "TRASH").length,
    sent: participants.filter((item) => item.location !== "TRASH" && item.thread.entries.length > 0).length,
    drafts,
    archive: participants.filter((item) => item.location === "ARCHIVE").length,
    trash: participants.filter((item) => item.location === "TRASH").length,
  };
}

export async function listMail(userId: string, options: { folder?: MailFolder; query?: string; cursor?: string; take?: number } = {}) {
  const folder = options.folder ?? "inbox";
  const take = Math.min(Math.max(options.take ?? 25, 1), 50);
  const query = options.query?.trim().slice(0, 100);
  if (folder === "drafts") {
    const items = await db.mailDraft.findMany({
      where: {
        ownerId: userId,
        ...(query ? { OR: [{ subject: { contains: query, mode: "insensitive" } }, { body: { contains: query, mode: "insensitive" } }] } : {}),
      },
      include: { recipients: { include: { recipient: { select: { id: true, username: true, displayName: true, imageUrl: true, role: true } } } } },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: take + 1,
      ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    });
    const hasMore = items.length > take;
    return { kind: "drafts" as const, items: items.slice(0, take), nextCursor: hasMore ? items[take - 1]?.id ?? null : null };
  }

  const where: Prisma.MailParticipantWhereInput = {
    ...participantWhere(userId, folder),
    ...(query ? {
      thread: {
        ...(folder === "sent" ? { entries: { some: { authorId: userId } } } : {}),
        OR: [
          { subject: { contains: query, mode: "insensitive" } },
          { entries: { some: { body: { contains: query, mode: "insensitive" } } } },
          { participants: { some: { user: { OR: [{ displayName: { contains: query, mode: "insensitive" } }, { username: { contains: query, mode: "insensitive" } }] } } } },
        ],
      },
    } : {}),
  };
  const rows = await db.mailParticipant.findMany({
    where,
    include: { thread: { include: mailThreadInclude } },
    orderBy: [{ thread: { lastActivityAt: "desc" } }, { threadId: "desc" }],
    take: take + 1,
    ...(options.cursor ? { cursor: { threadId_userId: { threadId: options.cursor, userId } }, skip: 1 } : {}),
  });
  const hasMore = rows.length > take;
  return { kind: "threads" as const, items: rows.slice(0, take), nextCursor: hasMore ? rows[take - 1]?.threadId ?? null : null };
}

export async function getMailThread(userId: string, threadId: string) {
  const participant = await db.mailParticipant.findUnique({
    where: { threadId_userId: { threadId, userId } },
    include: {
      thread: {
        include: {
          participants: { include: { user: { select: { id: true, username: true, displayName: true, imageUrl: true, role: true, status: true } } } },
          entries: { orderBy: { createdAt: "asc" }, include: { author: { select: { id: true, username: true, displayName: true, imageUrl: true, role: true } } } },
        },
      },
    },
  });
  return participant?.removedAt ? null : participant;
}

export async function getMailDraft(userId: string, draftId: string) {
  return db.mailDraft.findFirst({
    where: { id: draftId, ownerId: userId },
    include: { recipients: { include: { recipient: { select: { id: true, username: true, displayName: true, imageUrl: true, role: true, status: true } } } } },
  });
}
