import type { SpacePostingPolicy } from "@prisma/client";
import type { ForumRole } from "@/lib/roles";

type ViewerRole = ForumRole | null | undefined;

export function canStartDiscussion(role: ViewerRole, policy: SpacePostingPolicy) {
  if (!role) return false;
  return role === "ADMIN" || policy === "OPEN";
}

export function canComment(role: ViewerRole, policy: SpacePostingPolicy) {
  if (!role) return false;
  if (policy === "ADMIN_ONLY" || policy === "ANNOUNCEMENTS") return role === "ADMIN";
  return true;
}
