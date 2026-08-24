export const CLERK_ROLES = ["member", "moderator", "admin"] as const;

export type ClerkRole = (typeof CLERK_ROLES)[number];
export type ForumRole = "MEMBER" | "MODERATOR" | "ADMIN";

export function normalizeClerkRole(value: unknown): ForumRole {
  if (value === "moderator") return "MODERATOR";
  if (value === "admin") return "ADMIN";
  return "MEMBER";
}
