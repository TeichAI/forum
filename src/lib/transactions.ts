import "server-only";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

function retryable(error: unknown, retryUnique: boolean) {
  const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
  return code === "P2034" || (retryUnique && code === "P2002");
}

export async function withSerializableRetry<T>(
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
  options: { attempts?: number; retryUnique?: boolean } = {},
) {
  const attempts = options.attempts ?? 3;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await db.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (attempt === attempts || !retryable(error, Boolean(options.retryUnique))) throw error;
    }
  }
  throw new Error("Transaction retry limit exceeded");
}
