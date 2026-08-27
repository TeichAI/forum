import "server-only";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getMailThreadAccess, isCurrentMailStaff, type MailAccessViewer } from "@/lib/mail-access";
import { decodeCursor, encodeCursor } from "@/lib/queries";

export const MAIL_FOLDERS = ["inbox", "starred", "sent", "drafts", "archive", "trash", "staff"] as const;
export type MailFolder = (typeof MAIL_FOLDERS)[number];
export const STAFF_MAIL_FOLDERS = ["inbox", "starred", "archive", "trash"] as const;
export type StaffMailFolder = (typeof STAFF_MAIL_FOLDERS)[number];

export function normalizeMailFolder(value: unknown): MailFolder {
  return typeof value === "string" && MAIL_FOLDERS.includes(value as MailFolder) ? value as MailFolder : "inbox";
}

export function normalizeStaffMailFolder(value: unknown): StaffMailFolder {
  return typeof value === "string" && STAFF_MAIL_FOLDERS.includes(value as StaffMailFolder) ? value as StaffMailFolder : "inbox";
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
  staffMailbox: true,
} satisfies Prisma.MailThreadInclude;

function participantWhere(userId: string, folder: Exclude<MailFolder, "drafts" | "staff">): Prisma.MailParticipantWhereInput {
  const base: Prisma.MailParticipantWhereInput = { userId, removedAt: null };
  if (folder === "starred") return { ...base, starred: true, location: { not: "TRASH" } };
  if (folder === "sent") return { ...base, location: { not: "TRASH" }, thread: { entries: { some: { authorId: userId } } } };
  return { ...base, location: folder === "archive" ? "ARCHIVE" : folder === "trash" ? "TRASH" : "INBOX" };
}

export async function getMailCounts(userId: string) {
  const [rows, drafts] = await Promise.all([
    db.$queryRaw<Array<{ inbox: bigint; unread: bigint; starred: bigint; sent: bigint; archive: bigint; trash: bigint }>>(Prisma.sql`
      SELECT
        COUNT(*) FILTER (WHERE mp."location" = 'INBOX') AS inbox,
        COUNT(*) FILTER (WHERE mp."location" = 'INBOX' AND (mp."forcedUnread" OR mp."lastReadAt" IS NULL OR mp."lastReadAt" < mt."lastActivityAt")) AS unread,
        COUNT(*) FILTER (WHERE mp."starred" AND mp."location" <> 'TRASH') AS starred,
        COUNT(*) FILTER (WHERE mp."location" <> 'TRASH' AND EXISTS (SELECT 1 FROM "MailEntry" me WHERE me."threadId" = mp."threadId" AND me."authorId" = ${userId})) AS sent,
        COUNT(*) FILTER (WHERE mp."location" = 'ARCHIVE') AS archive,
        COUNT(*) FILTER (WHERE mp."location" = 'TRASH') AS trash
      FROM "MailParticipant" mp
      JOIN "MailThread" mt ON mt."id" = mp."threadId"
      WHERE mp."userId" = ${userId} AND mp."removedAt" IS NULL
    `),
    db.mailDraft.count({ where: { ownerId: userId } }),
  ]);
  const counts = rows[0] ?? { inbox: BigInt(0), unread: BigInt(0), starred: BigInt(0), sent: BigInt(0), archive: BigInt(0), trash: BigInt(0) };
  return {
    inbox: Number(counts.inbox),
    unread: Number(counts.unread),
    starred: Number(counts.starred),
    sent: Number(counts.sent),
    drafts,
    archive: Number(counts.archive),
    trash: Number(counts.trash),
  };
}

export async function getStaffMailCounts(viewer: MailAccessViewer) {
  if (!await isCurrentMailStaff(viewer)) return { inbox: 0, unread: 0, starred: 0, archive: 0, trash: 0 };
  const rows = await db.$queryRaw<Array<{ inbox: bigint; unread: bigint; starred: bigint; archive: bigint; trash: bigint }>>(Prisma.sql`
    SELECT
      COUNT(*) FILTER (WHERE smt."location" = 'INBOX') AS inbox,
      COUNT(*) FILTER (WHERE smt."location" = 'INBOX' AND (smt."forcedUnread" OR smt."lastReadAt" IS NULL OR smt."lastReadAt" < mt."lastActivityAt")) AS unread,
      COUNT(*) FILTER (WHERE smt."starred" AND smt."location" <> 'TRASH') AS starred,
      COUNT(*) FILTER (WHERE smt."location" = 'ARCHIVE') AS archive,
      COUNT(*) FILTER (WHERE smt."location" = 'TRASH') AS trash
    FROM "StaffMailboxThread" smt
    JOIN "MailThread" mt ON mt."id" = smt."threadId"
    WHERE smt."removedAt" IS NULL
  `);
  const counts = rows[0] ?? { inbox: BigInt(0), unread: BigInt(0), starred: BigInt(0), archive: BigInt(0), trash: BigInt(0) };
  return Object.fromEntries(Object.entries(counts).map(([key, value]) => [key, Number(value)])) as {
    inbox: number; unread: number; starred: number; archive: number; trash: number;
  };
}

export async function listMail(userId: string, options: { folder?: MailFolder; query?: string; cursor?: string; take?: number } = {}) {
  const requestedFolder = options.folder ?? "inbox";
  const folder = requestedFolder === "staff" ? "inbox" : requestedFolder;
  const take = Math.min(Math.max(options.take ?? 25, 1), 50);
  const query = options.query?.trim().slice(0, 100);
  if (folder === "drafts") {
    const cursor = decodeCursor<{ updatedAt: string; id: string }>(options.cursor);
    const cursorTime = cursor && !Number.isNaN(Date.parse(cursor.updatedAt)) ? new Date(cursor.updatedAt) : null;
    const cursorId = cursor?.id;
    const items = await db.mailDraft.findMany({
      where: {
        ownerId: userId,
        ...(query ? { OR: [{ subject: { contains: query, mode: "insensitive" } }, { body: { contains: query, mode: "insensitive" } }] } : {}),
        AND: cursorTime && cursorId ? { OR: [{ updatedAt: { lt: cursorTime } }, { updatedAt: cursorTime, id: { lt: cursorId } }] } : undefined,
      },
      include: { recipients: { include: { recipient: { select: { id: true, username: true, displayName: true, imageUrl: true, role: true } } } } },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: take + 1,
    });
    const hasMore = items.length > take;
    const visible = items.slice(0, take);
    const last = visible.at(-1);
    return { kind: "drafts" as const, items: visible.map((item) => ({ ...item, accessContext: "personal" as const })), nextCursor: hasMore && last ? encodeCursor({ updatedAt: last.updatedAt.toISOString(), id: last.id }) : null };
  }

  const cursor = decodeCursor<{ lastActivityAt: string; id: string }>(options.cursor);
  const cursorTime = cursor && !Number.isNaN(Date.parse(cursor.lastActivityAt)) ? new Date(cursor.lastActivityAt) : null;
  const cursorId = cursor?.id;
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
    AND: cursorTime && cursorId ? { OR: [{ thread: { lastActivityAt: { lt: cursorTime } } }, { thread: { lastActivityAt: cursorTime }, threadId: { lt: cursorId } }] } : undefined,
  };
  const rows = await db.mailParticipant.findMany({
    where,
    include: { thread: { include: mailThreadInclude } },
    orderBy: [{ thread: { lastActivityAt: "desc" } }, { threadId: "desc" }],
    take: take + 1,
  });
  const hasMore = rows.length > take;
  const visible = rows.slice(0, take);
  const last = visible.at(-1);
  return { kind: "threads" as const, items: visible.map((item) => ({ ...item, accessContext: "personal" as const })), nextCursor: hasMore && last ? encodeCursor({ lastActivityAt: last.thread.lastActivityAt.toISOString(), id: last.threadId }) : null };
}

export async function listStaffMail(viewer: MailAccessViewer, options: { folder?: StaffMailFolder; query?: string; cursor?: string; take?: number } = {}) {
  if (!await isCurrentMailStaff(viewer)) return { kind: "threads" as const, items: [], nextCursor: null };
  const folder = options.folder ?? "inbox";
  const take = Math.min(Math.max(options.take ?? 25, 1), 50);
  const query = options.query?.trim().slice(0, 100);
  const cursor = decodeCursor<{ lastActivityAt: string; id: string }>(options.cursor);
  const cursorTime = cursor && !Number.isNaN(Date.parse(cursor.lastActivityAt)) ? new Date(cursor.lastActivityAt) : null;
  const cursorId = cursor?.id;
  const base: Prisma.StaffMailboxThreadWhereInput = { removedAt: null };
  if (folder === "starred") Object.assign(base, { starred: true, location: { not: "TRASH" } });
  else Object.assign(base, { location: folder === "archive" ? "ARCHIVE" : folder === "trash" ? "TRASH" : "INBOX" });
  const rows = await db.staffMailboxThread.findMany({
    where: {
      ...base,
      ...(query ? { thread: { OR: [
        { subject: { contains: query, mode: "insensitive" } },
        { entries: { some: { body: { contains: query, mode: "insensitive" } } } },
        { participants: { some: { user: { OR: [{ displayName: { contains: query, mode: "insensitive" } }, { username: { contains: query, mode: "insensitive" } }] } } } },
      ] } } : {}),
      AND: cursorTime && cursorId ? { OR: [{ thread: { lastActivityAt: { lt: cursorTime } } }, { thread: { lastActivityAt: cursorTime }, threadId: { lt: cursorId } }] } : undefined,
    },
    include: { thread: { include: mailThreadInclude } },
    orderBy: [{ thread: { lastActivityAt: "desc" } }, { threadId: "desc" }],
    take: take + 1,
  });
  const hasMore = rows.length > take;
  const visible = rows.slice(0, take);
  const last = visible.at(-1);
  return { kind: "threads" as const, items: visible.map((item) => ({ ...item, accessContext: "staff" as const })), nextCursor: hasMore && last ? encodeCursor({ lastActivityAt: last.thread.lastActivityAt.toISOString(), id: last.threadId }) : null };
}

export async function getMailThread(viewer: MailAccessViewer, threadId: string) {
  const access = await getMailThreadAccess(viewer, threadId);
  if (!access) return null;
  const thread = await db.mailThread.findUnique({
    where: { id: threadId },
    include: {
      staffMailbox: true,
      participants: { include: { user: { select: { id: true, username: true, displayName: true, imageUrl: true, role: true, status: true } } } },
      entries: { orderBy: { createdAt: "asc" }, include: { author: { select: { id: true, username: true, displayName: true, imageUrl: true, role: true } } } },
    },
  });
  if (!thread) return null;
  return { ...access.state, accessContext: access.kind, isStaffMailbox: Boolean(thread.staffMailbox), thread };
}

export async function getMailDraft(userId: string, draftId: string) {
  return db.mailDraft.findFirst({
    where: { id: draftId, ownerId: userId },
    include: { recipients: { include: { recipient: { select: { id: true, username: true, displayName: true, imageUrl: true, role: true, status: true } } } } },
  });
}
