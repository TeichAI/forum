import type { SpacePostingPolicy } from "@prisma/client";
import type { ForumRole } from "@/lib/roles";

type ViewerRole = ForumRole | null | undefined;

export function canStartDiscussion(role: ViewerRole, policy: SpacePostingPolicy) {
  if (!role) return false;
  return role === "ADMIN" || policy === "OPEN";
}

export function canComment(role: ViewerRole, policy: SpacePostingPolicy) {
  if (!role) return false;
  return role === "ADMIN" || policy !== "ADMIN_ONLY";
}
