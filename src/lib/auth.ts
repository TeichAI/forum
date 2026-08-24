import "server-only";
import { auth, clerkClient, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getE2ETestUserId, isE2ETestMode } from "@/lib/e2e-auth";
import { type ForumRole, normalizeClerkRole } from "@/lib/roles";
import { slugify } from "@/lib/utils";

async function availableUsername(candidate: string, clerkId: string) {
  const base = slugify(candidate).replace(/-/g, "_").slice(0, 24) || "member";
  for (let index = 0; index < 20; index += 1) {
    const username = index === 0 ? base : `${base}_${Math.random().toString(36).slice(2, 6)}`;
    const found = await db.user.findUnique({ where: { username }, select: { clerkId: true } });
    if (!found || found.clerkId === clerkId) return username;
  }
  return `member_${crypto.randomUUID().slice(0, 8)}`;
}

export async function syncCurrentUser() {
  if (isE2ETestMode()) {
    const testUserId = await getE2ETestUserId();
    return testUserId ? db.user.findUnique({ where: { id: testUserId } }) : null;
  }
  const { userId, sessionClaims } = await auth();
  if (!userId) return null;
  const authorityRole = normalizeClerkRole(sessionClaims?.forum_role);

  const existing = await db.user.findUnique({ where: { clerkId: userId } });
  if (existing) return { ...existing, role: authorityRole };

  const clerkUser = await currentUser();
  if (!clerkUser) return null;
  const preferred = clerkUser.username || [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || "member";
  const username = await availableUsername(preferred, userId);
  const email = clerkUser.emailAddresses.find((item) => item.id === clerkUser.primaryEmailAddressId)?.emailAddress;

  try {
    const user = await db.user.upsert({
      where: { clerkId: userId },
      update: {},
      create: {
        clerkId: userId,
        username,
        displayName: [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || username,
        email,
        imageUrl: clerkUser.imageUrl,
        role: normalizeClerkRole(clerkUser.publicMetadata?.role),
      },
    });
    return { ...user, role: authorityRole };
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      const raced = await db.user.findUnique({ where: { clerkId: userId } });
      if (raced) return { ...raced, role: authorityRole };
    }
    throw error;
  }
}

export async function getVerifiedUserRole(user: { clerkId: string; role: ForumRole }): Promise<ForumRole | null> {
  if (isE2ETestMode()) return user.role;
  try {
    const clerkUser = await (await clerkClient()).users.getUser(user.clerkId);
    return normalizeClerkRole(clerkUser.publicMetadata?.role);
  } catch {
    return null;
  }
}

export async function getViewer() {
  return syncCurrentUser();
}

export async function requireUser() {
  const user = await syncCurrentUser();
  if (!user) redirect("/sign-in");
  if (user.status !== "ACTIVE" || (user.suspendedUntil && user.suspendedUntil > new Date())) {
    redirect("/suspended");
  }
  return user;
}

export async function requireModerator() {
  const user = await requireUser();
  if (user.role !== "MODERATOR" && user.role !== "ADMIN") redirect("/");
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/");
  return user;
}
