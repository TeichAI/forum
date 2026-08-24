import "server-only";
import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getE2ETestUserId, isE2ETestMode } from "@/lib/e2e-auth";
import { slugify } from "@/lib/utils";

function isBootstrapAdmin(clerkId: string) {
  return (process.env.ADMIN_CLERK_USER_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .includes(clerkId);
}

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
  const { userId } = await auth();
  if (!userId) return null;

  const existing = await db.user.findUnique({ where: { clerkId: userId } });
  if (existing) return existing;

  const clerkUser = await currentUser();
  if (!clerkUser) return null;
  const preferred = clerkUser.username || [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || "member";
  const username = await availableUsername(preferred, userId);
  const email = clerkUser.emailAddresses.find((item) => item.id === clerkUser.primaryEmailAddressId)?.emailAddress;

  try {
    return await db.user.upsert({
      where: { clerkId: userId },
      update: {},
      create: {
        clerkId: userId,
        username,
        displayName: [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || username,
        email,
        imageUrl: clerkUser.imageUrl,
        role: isBootstrapAdmin(userId) ? "ADMIN" : "MEMBER",
      },
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      const raced = await db.user.findUnique({ where: { clerkId: userId } });
      if (raced) return raced;
    }
    throw error;
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
