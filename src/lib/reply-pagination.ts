import "server-only";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { decodeCursor, encodeCursor } from "@/lib/queries";

export const REPLY_BRANCH_PAGE_SIZE = 100;
const ROOT_PAGE_SIZE = 10;

type RootCursor = { createdAt: string; id: string };

export async function listReplyBranches(options: {
  threadId: string;
  viewerId?: string;
  viewerIsStaff?: boolean;
  cursor?: string;
  branchId?: string;
  branchPage?: number;
}) {
  const rawPage = options.branchPage ?? 0;
  const requestedPage = Number.isFinite(rawPage) ? Math.min(100, Math.max(0, Math.floor(rawPage))) : 0;
  let roots: Array<{ id: string; createdAt: Date }>;
  let nextCursor: string | null = null;

  const statusFilter = options.viewerIsStaff ? {} : { status: "PUBLISHED" as const };

  if (options.branchId) {
    const root = await db.reply.findFirst({
      where: { id: options.branchId, threadId: options.threadId, parentReplyId: null, ...statusFilter },
      select: { id: true, createdAt: true },
    });
    roots = root ? [root] : [];
  } else {
    const cursor = decodeCursor<RootCursor>(options.cursor);
    const cursorTime = cursor && !Number.isNaN(Date.parse(cursor.createdAt)) ? new Date(cursor.createdAt) : null;
    const fetched = await db.reply.findMany({
      where: {
        threadId: options.threadId,
        parentReplyId: null,
        ...statusFilter,
        AND: cursorTime && cursor?.id ? { OR: [{ createdAt: { gt: cursorTime } }, { createdAt: cursorTime, id: { gt: cursor.id } }] } : undefined,
      },
      select: { id: true, createdAt: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: ROOT_PAGE_SIZE + 1,
    });
    roots = fetched.slice(0, ROOT_PAGE_SIZE);
    const last = roots.at(-1);
    nextCursor = fetched.length > ROOT_PAGE_SIZE && last ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id }) : null;
  }

  const branchRows = await Promise.all(roots.map(async (root) => {
    const offset = options.branchId ? requestedPage * REPLY_BRANCH_PAGE_SIZE : 0;
    const rows = options.viewerIsStaff
      ? await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          WITH RECURSIVE branch AS (
            SELECT reply."id", reply."parentReplyId", ARRAY[reply."id"]::text[] AS path
            FROM "Reply" reply
            WHERE reply."id" = ${root.id} AND reply."threadId" = ${options.threadId}
            UNION ALL
            SELECT child."id", child."parentReplyId", branch.path || child."id"
            FROM "Reply" child
            JOIN branch ON child."parentReplyId" = branch."id"
            WHERE child."threadId" = ${options.threadId} AND NOT child."id" = ANY(branch.path)
          )
          SELECT "id" FROM branch
          ORDER BY path
          OFFSET ${offset}
          LIMIT ${REPLY_BRANCH_PAGE_SIZE + 1}
        `)
      : await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          WITH RECURSIVE branch AS (
            SELECT reply."id", reply."parentReplyId", ARRAY[reply."id"]::text[] AS path
            FROM "Reply" reply
            WHERE reply."id" = ${root.id} AND reply."threadId" = ${options.threadId}
              AND reply."status" = 'PUBLISHED'
            UNION ALL
            SELECT child."id", child."parentReplyId", branch.path || child."id"
            FROM "Reply" child
            JOIN branch ON child."parentReplyId" = branch."id"
            WHERE child."threadId" = ${options.threadId} AND NOT child."id" = ANY(branch.path)
              AND child."status" = 'PUBLISHED'
          )
          SELECT "id" FROM branch
          ORDER BY path
          OFFSET ${offset}
          LIMIT ${REPLY_BRANCH_PAGE_SIZE + 1}
        `);
    return { rootId: root.id, rows };
  }));

  const ids = branchRows.flatMap(({ rows }) => rows.slice(0, REPLY_BRANCH_PAGE_SIZE).map((row) => row.id));
  const items = ids.length ? await db.reply.findMany({
    where: { id: { in: ids } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    include: {
      author: { select: { id: true, username: true, displayName: true, imageUrl: true, role: true, status: true } },
      upvotes: options.viewerId ? { where: { userId: options.viewerId } } : false,
      dislikes: options.viewerId ? { where: { userId: options.viewerId } } : false,
      _count: { select: { upvotes: true, dislikes: true } },
    },
  }) : [];

  return {
    items,
    nextCursor,
    continuations: branchRows.filter(({ rows }) => rows.length > REPLY_BRANCH_PAGE_SIZE).map(({ rootId }) => ({ rootId, page: requestedPage + 1 })),
    selectedBranchId: options.branchId ?? null,
  };
}
