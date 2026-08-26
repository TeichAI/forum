import "server-only";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

type CleanupClient = Pick<Prisma.TransactionClient, "attachment">;
type Storage = { deleteFiles(keys: string[]): Promise<unknown> };

export async function cleanupUnclaimedUploads({ storage, client = db, now = new Date(), take = 100 }: { storage: Storage; client?: CleanupClient; now?: Date; take?: number }) {
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1_000);
  const stale = await client.attachment.findMany({
    where: { context: { in: ["DRAFT", "MAIL_DRAFT"] }, createdAt: { lt: cutoff } },
    orderBy: { createdAt: "asc" },
    take: Math.min(Math.max(take, 1), 500),
    select: { id: true, key: true },
  });
  if (!stale.length) return { removed: 0 };
  const removedKeys: string[] = [];
  for (const item of stale) {
    const result = await client.attachment.deleteMany({
      where: { id: item.id, context: { in: ["DRAFT", "MAIL_DRAFT"] }, createdAt: { lt: cutoff } },
    });
    if (result.count === 1) removedKeys.push(item.key);
  }
  if (removedKeys.length) await storage.deleteFiles(removedKeys);
  return { removed: removedKeys.length };
}
