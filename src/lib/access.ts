import "server-only";

import { Prisma, type UserRole } from "@prisma/client";

export const publicThreadWhere = {
  status: "PUBLISHED",
  category: { archivedAt: null },
  author: { status: "ACTIVE" },
} satisfies Prisma.ThreadWhereInput;

export const publicReplyWhere = {
  status: "PUBLISHED",
  author: { status: "ACTIVE" },
  thread: publicThreadWhere,
} satisfies Prisma.ReplyWhereInput;

export const activeMemberWhere = {
  status: "ACTIVE",
} satisfies Prisma.UserWhereInput;

export function canAccessStaffContent(viewer: { role: UserRole; status: string } | null | undefined) {
  return viewer?.status === "ACTIVE" && (viewer.role === "MODERATOR" || viewer.role === "ADMIN");
}

export function canModerateAuthor(actorRole: UserRole, authorRole: UserRole) {
  if (authorRole === "ADMIN") return false;
  if (actorRole === "ADMIN") return authorRole === "MEMBER" || authorRole === "MODERATOR";
  return actorRole === "MODERATOR" && authorRole === "MEMBER";
}

export const unavailableMetadata = {
  title: "Content unavailable",
  description: "This content is unavailable.",
  robots: { index: false, follow: false },
} as const;

export class DomainError extends Error {
  constructor(
    message: string,
    readonly code: "NOT_FOUND" | "FORBIDDEN" | "STATE_CONFLICT" = "NOT_FOUND",
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export function inaccessible(message = "This resource is unavailable") {
  return new DomainError(message, "NOT_FOUND");
}
