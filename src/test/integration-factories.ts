import type { Prisma, UserRole } from "@prisma/client";
import { db } from "@/lib/db";

let sequence = 0;

export async function createTestUser(overrides: Partial<Prisma.UserCreateInput> = {}) {
  sequence += 1;
  const suffix = `${sequence}_${Math.random().toString(36).slice(2, 8)}`;
  return db.user.create({
    data: {
      clerkId: `clerk_${suffix}`,
      username: `user_${suffix}`,
      displayName: `Test User ${sequence}`,
      role: (overrides.role as UserRole | undefined) ?? "MEMBER",
      ...overrides,
    },
  });
}

export async function createTestCategory(overrides: Partial<Prisma.CategoryCreateInput> = {}) {
  sequence += 1;
  return db.category.create({
    data: {
      name: `Category ${sequence}`,
      slug: `category-${sequence}-${Math.random().toString(36).slice(2, 7)}`,
      description: "Integration test category",
      ...overrides,
    },
  });
}

export async function createTestThread(authorId: string, categoryId: string, overrides: Partial<Prisma.ThreadUncheckedCreateInput> = {}) {
  sequence += 1;
  return db.thread.create({
    data: {
      slug: `thread-${sequence}-${Math.random().toString(36).slice(2, 7)}`,
      title: `Integration thread ${sequence}`,
      body: "Searchable integration body",
      authorId,
      categoryId,
      ...overrides,
    },
  });
}
