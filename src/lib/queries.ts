import "server-only";
import { Prisma, type User, type UserRole } from "@prisma/client";
import { activeMemberWhere, publicThreadWhere } from "@/lib/access";
import { db } from "@/lib/db";

export const threadListInclude = {
  author: { select: { id: true, username: true, displayName: true, imageUrl: true, role: true } },
  category: true,
  tags: { include: { tag: true } },
  poll: { select: { expiresAt: true } },
  _count: { select: { replies: true, upvotes: true, dislikes: true, bookmarks: true } },
} satisfies Prisma.ThreadInclude;

type ThreadCursor = { sort: "recent" | "new" | "top"; pinned: boolean; time: string; id: string };

export function encodeCursor(value: object) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

export function decodeCursor<T extends object>(value: string | undefined): T | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    return parsed && typeof parsed === "object" ? parsed as T : null;
  } catch {
    return null;
  }
}

function threadCursorWhere(cursor: ThreadCursor | null, sort: ThreadCursor["sort"]): Prisma.ThreadWhereInput | undefined {
  if (!cursor || cursor.sort !== sort || !cursor.id || Number.isNaN(Date.parse(cursor.time))) return undefined;
  if (sort === "top") return undefined;
  const field = sort === "new" ? "createdAt" : "bumpedAt";
  const time = new Date(cursor.time);
  const withinPinned = {
    isPinned: cursor.pinned,
    OR: [{ [field]: { lt: time } }, { [field]: time, id: { lt: cursor.id } }],
  } as Prisma.ThreadWhereInput;
  return cursor.pinned ? { OR: [withinPinned, { isPinned: false }] } : withinPinned;
}

export async function listThreadsPage(options: {
  categoryId?: string;
  tagId?: string;
  authorId?: string;
  sort?: "recent" | "new" | "top";
  take?: number;
  cursor?: string;
} = {}) {
  const { categoryId, tagId, authorId, sort = "recent" } = options;
  const take = Math.min(Math.max(options.take ?? 30, 1), 50);
  const cursor = decodeCursor<ThreadCursor>(options.cursor);
  const items = await db.thread.findMany({
    where: {
      ...publicThreadWhere,
      categoryId,
      authorId,
      tags: tagId ? { some: { tagId } } : undefined,
      AND: threadCursorWhere(cursor, sort),
    },
    include: threadListInclude,
    orderBy:
      sort === "new"
        ? [{ isPinned: "desc" }, { createdAt: "desc" }, { id: "desc" }]
        : sort === "top"
          ? [{ isPinned: "desc" }, { upvotes: { _count: "desc" } }, { bumpedAt: "desc" }, { id: "desc" }]
          : [{ isPinned: "desc" }, { bumpedAt: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(sort === "top" && cursor?.sort === "top" ? { cursor: { id: cursor.id }, skip: 1 } : {}),
  });
  const visible = items.slice(0, take);
  const last = visible.at(-1);
  return {
    items: visible,
    nextCursor: items.length > take && last ? encodeCursor({ sort, pinned: last.isPinned, time: (sort === "new" ? last.createdAt : last.bumpedAt).toISOString(), id: last.id }) : null,
  };
}

export async function listThreads(options: {
  categoryId?: string;
  tagId?: string;
  authorId?: string;
  sort?: "recent" | "new" | "top";
  take?: number;
  cursor?: string;
} = {}) {
  return (await listThreadsPage(options)).items;
}

type ActivityCursor = { time: string; id: string };

type MemberCursor = { displayName: string; id: string };

export const memberListSelect = {
  id: true,
  username: true,
  displayName: true,
  bio: true,
  imageUrl: true,
  role: true,
  createdAt: true,
  _count: {
    select: {
      threads: { where: publicThreadWhere },
      replies: {
        where: {
          status: "PUBLISHED",
          thread: publicThreadWhere,
        },
      },
    },
  },
} satisfies Prisma.UserSelect;

export async function listMembersPage(query = "", cursorValue?: string, requestedTake = 24, role?: UserRole) {
  const q = query.trim().slice(0, 80);
  const take = Math.min(Math.max(requestedTake, 1), 50);
  const cursor = decodeCursor<MemberCursor>(cursorValue);
  const hasCursor = Boolean(cursor?.displayName && cursor.id);
  const items = await db.user.findMany({
    where: {
      ...activeMemberWhere,
      role,
      AND: [
        q ? {
          OR: [
            { displayName: { contains: q, mode: "insensitive" } },
            { username: { contains: q, mode: "insensitive" } },
          ],
        } : {},
        hasCursor ? {
          OR: [
            { displayName: { gt: cursor!.displayName } },
            { displayName: cursor!.displayName, id: { gt: cursor!.id } },
          ],
        } : {},
      ],
    },
    select: memberListSelect,
    orderBy: [{ displayName: "asc" }, { id: "asc" }],
    take: take + 1,
  });
  const visible = items.slice(0, take);
  const last = visible.at(-1);
  return {
    items: visible,
    nextCursor: items.length > take && last
      ? encodeCursor({ displayName: last.displayName, id: last.id })
      : null,
  };
}

export async function searchThreadsPage(query: string, cursorValue?: string, requestedTake = 25) {
  const q = query.trim().slice(0, 100);
  if (!q) return { items: [], nextCursor: null };
  const take = Math.min(Math.max(requestedTake, 1), 50);
  const cursor = decodeCursor<ActivityCursor>(cursorValue);
  const cursorTime = cursor && !Number.isNaN(Date.parse(cursor.time)) ? new Date(cursor.time) : null;
  const cursorId = cursor?.id;
  const items = await db.thread.findMany({
    where: {
      ...publicThreadWhere,
      AND: [
        cursorTime && cursorId ? { OR: [{ bumpedAt: { lt: cursorTime } }, { bumpedAt: cursorTime, id: { lt: cursorId } }] } : {},
        { OR: [
          { title: { contains: q, mode: "insensitive" } },
          { body: { contains: q, mode: "insensitive" } },
          { replies: { some: { body: { contains: q, mode: "insensitive" }, status: "PUBLISHED", author: { status: "ACTIVE" } } } },
          { tags: { some: { tag: { name: { contains: q, mode: "insensitive" } } } } },
          { author: { username: { contains: q, mode: "insensitive" } } },
        ] },
      ],
    },
    include: threadListInclude,
    orderBy: [{ bumpedAt: "desc" }, { id: "desc" }],
    take: take + 1,
  });
  const visible = items.slice(0, take);
  const last = visible.at(-1);
  return {
    items: visible,
    nextCursor: items.length > take && last ? encodeCursor({ time: last.bumpedAt.toISOString(), id: last.id }) : null,
  };
}

export async function searchThreads(query: string) {
  return (await searchThreadsPage(query, undefined, 50)).items;
}

export function canModerate(user: Pick<User, "role"> | null) {
  return user?.role === "MODERATOR" || user?.role === "ADMIN";
}
