import "server-only";

import { getVerifiedUserRole } from "@/lib/auth";
import type { ForumRole } from "@/lib/roles";

export type PollThreadVisibility = {
  status: string;
  author: { status: string };
  category: { archivedAt: Date | null };
};

export function isPublicPollThread(thread: PollThreadVisibility) {
  return thread.status === "PUBLISHED"
    && thread.author.status === "ACTIVE"
    && !thread.category.archivedAt;
}

export async function canAccessPollThread(
  thread: PollThreadVisibility,
  viewer: { clerkId: string; role: ForumRole } | null | undefined,
) {
  if (isPublicPollThread(thread)) return true;
  if (!viewer || (viewer.role !== "MODERATOR" && viewer.role !== "ADMIN")) return false;
  const verifiedRole = await getVerifiedUserRole(viewer);
  return verifiedRole === "MODERATOR" || verifiedRole === "ADMIN";
}
