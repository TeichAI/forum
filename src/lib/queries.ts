import "server-only";
import { Prisma, type User } from "@prisma/client";
import { db } from "@/lib/db";

export const threadListInclude = {
  author: { select: { id: true, username: true, displayName: true, imageUrl: true, role: true } },
  category: true,
  tags: { include: { tag: true } },
  _count: { select: { replies: true, votes: true, bookmarks: true } },
} satisfies Prisma.ThreadInclude;

export async function listThreads(options: {
  categoryId?: string;
  tagId?: string;
  authorId?: string;
  sort?: "recent" | "new" | "top";
  take?: number;
} = {}) {
  const { categoryId, tagId, authorId, sort = "recent", take = 30 } = options;
  return db.thread.findMany({
    where: {
      status: "PUBLISHED",
      category: { archivedAt: null },
      categoryId,
      authorId,
      tags: tagId ? { some: { tagId } } : undefined,
    },
    include: threadListInclude,
    orderBy:
      sort === "new"
        ? [{ isPinned: "desc" }, { createdAt: "desc" }]
        : sort === "top"
          ? [{ isPinned: "desc" }, { votes: { _count: "desc" } }, { bumpedAt: "desc" }]
          : [{ isPinned: "desc" }, { bumpedAt: "desc" }],
    take,
  });
}

export async function searchThreads(query: string) {
  const q = query.trim().slice(0, 100);
  if (!q) return [];
  return db.thread.findMany({
    where: {
      status: "PUBLISHED",
      category: { archivedAt: null },
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { body: { contains: q, mode: "insensitive" } },
        { replies: { some: { body: { contains: q, mode: "insensitive" }, status: "PUBLISHED" } } },
        { tags: { some: { tag: { name: { contains: q, mode: "insensitive" } } } } },
        { author: { username: { contains: q, mode: "insensitive" } } },
      ],
    },
    include: threadListInclude,
    orderBy: { bumpedAt: "desc" },
    take: 50,
  });
}

export function canModerate(user: Pick<User, "role"> | null) {
  return user?.role === "MODERATOR" || user?.role === "ADMIN";
}
