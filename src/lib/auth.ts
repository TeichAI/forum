import "server-only";
import { auth, clerkClient, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getE2ETestUserId, isE2ETestMode } from "@/lib/e2e-auth";
import { type ForumRole, normalizeClerkRole } from "@/lib/roles";
import { provisionClerkUser } from "@/lib/user-provisioning";

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
  const email = clerkUser.emailAddresses.find((item) => item.id === clerkUser.primaryEmailAddressId)?.emailAddress;
  const user = await provisionClerkUser({
    clerkId: userId,
    preferredUsername: preferred,
    displayName: [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" "),
    email,
    imageUrl: clerkUser.imageUrl,
    role: normalizeClerkRole(clerkUser.publicMetadata?.role),
  });
  return { ...user, role: authorityRole };
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

export async function getSessionUser() {
  return syncCurrentUser();
}

async function resolveActiveUser(user: Awaited<ReturnType<typeof syncCurrentUser>>) {
  if (!user) return null;
  if (user.status === "SUSPENDED" && user.suspendedUntil && user.suspendedUntil <= new Date()) {
    const restored = await db.user.updateMany({
      where: { id: user.id, status: "SUSPENDED", suspendedUntil: { lte: new Date() } },
      data: { status: "ACTIVE", suspendedUntil: null, suspensionReason: null },
    });
    if (restored.count !== 1) {
      const current = await db.user.findUnique({ where: { id: user.id } });
      return current?.status === "ACTIVE" ? { ...current, role: user.role } : null;
    }
    return { ...user, status: "ACTIVE" as const, suspendedUntil: null, suspensionReason: null };
  }
  if (user.status !== "ACTIVE" || (user.suspendedUntil && user.suspendedUntil > new Date())) return null;
  return user;
}

export async function getViewer(sessionUser?: Awaited<ReturnType<typeof syncCurrentUser>>) {
  return resolveActiveUser(sessionUser === undefined ? await syncCurrentUser() : sessionUser);
}

export async function requireUser() {
  const sessionUser = await syncCurrentUser();
  if (!sessionUser) redirect("/sign-in");
  const user = await resolveActiveUser(sessionUser);
  if (!user) redirect("/suspended");
  return user;
}

export async function requireModerator() {
  const user = await requireUser();
  const role = await getVerifiedUserRole(user);
  if (role !== "MODERATOR" && role !== "ADMIN") redirect("/");
  return { ...user, role };
}

export async function requireAdmin() {
  const user = await requireUser();
  const role = await getVerifiedUserRole(user);
  if (role !== "ADMIN") redirect("/");
  return { ...user, role };
}
