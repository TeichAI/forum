import "server-only";

import { Prisma, type UserRole } from "@prisma/client";
import { db } from "@/lib/db";
import { slugify } from "@/lib/utils";

type UserClient = Pick<Prisma.TransactionClient, "user">;

export type ClerkProfileInput = {
  clerkId: string;
  preferredUsername?: string | null;
  displayName?: string | null;
  email?: string | null;
  imageUrl?: string | null;
  role: UserRole;
};

function usernameBase(value: string | null | undefined) {
  return slugify(value?.trim() || "member").replace(/-/g, "_").slice(0, 24) || "member";
}

function deterministicSuffix(clerkId: string) {
  const suffix = clerkId.replace(/[^a-zA-Z0-9]/g, "").slice(-8).toLowerCase();
  return suffix || "account";
}

export async function allocateUsername(
  preferred: string | null | undefined,
  clerkId: string,
  client: UserClient = db,
  attempt = 0,
) {
  const base = usernameBase(preferred);
  const suffix = deterministicSuffix(clerkId);
  const tail = attempt === 0 ? "" : `_${suffix}${attempt === 1 ? "" : `_${attempt}`}`;
  const candidate = `${base.slice(0, 30 - tail.length)}${tail}`;
  const found = await client.user.findUnique({ where: { username: candidate }, select: { clerkId: true } });
  return !found || found.clerkId === clerkId ? candidate : null;
}

function isUniqueConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError
    ? error.code === "P2002"
    : typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

export async function provisionClerkUser(input: ClerkProfileInput, client: UserClient = db) {
  const current = await client.user.findUnique({ where: { clerkId: input.clerkId } });
  if (current) {
    return client.user.upsert({
      where: { clerkId: input.clerkId },
      update: { email: input.email ?? undefined, imageUrl: input.imageUrl ?? undefined, role: input.role },
      create: {
        clerkId: input.clerkId,
        username: current.username,
        displayName: current.displayName,
        email: input.email ?? undefined,
        imageUrl: input.imageUrl ?? undefined,
        role: input.role,
      },
    });
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const username = await allocateUsername(input.preferredUsername, input.clerkId, client, attempt);
    if (!username) continue;
    try {
      return await client.user.upsert({
        where: { clerkId: input.clerkId },
        update: { email: input.email ?? undefined, imageUrl: input.imageUrl ?? undefined, role: input.role },
        create: {
          clerkId: input.clerkId,
          username,
          displayName: input.displayName?.trim() || username,
          email: input.email ?? undefined,
          imageUrl: input.imageUrl ?? undefined,
          role: input.role,
        },
      });
    } catch (error) {
      if (!isUniqueConflict(error)) throw error;
      const raced = await client.user.findUnique({ where: { clerkId: input.clerkId } });
      if (raced) return raced;
    }
  }
  throw new Error("Unable to allocate a unique username");
}
