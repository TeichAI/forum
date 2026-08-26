import "server-only";

import type { UserRole } from "@prisma/client";
import { cache } from "react";
import { canModerateAuthor } from "@/lib/access";
import { db } from "@/lib/db";

export const DEFAULT_MODERATION_SETTINGS = {
  reportReasons: ["Spam", "Harassment", "Unsafe content", "Off topic", "Other"],
  suspensionDurationsDays: [1, 3, 7, 30, 90],
  actionReasons: ["Spam", "Harassment", "Unsafe content", "Off topic", "Repeated violations", "Other"],
} as const;

export const getModerationSettings = cache(async () => {
  return await db.moderationSettings.findUnique({ where: { id: "default" } }) ?? {
    id: "default",
    reportReasons: [...DEFAULT_MODERATION_SETTINGS.reportReasons],
    suspensionDurationsDays: [...DEFAULT_MODERATION_SETTINGS.suspensionDurationsDays],
    actionReasons: [...DEFAULT_MODERATION_SETTINGS.actionReasons],
    updatedAt: new Date(0),
  };
});

export function canModerateRole(actorRole: UserRole, targetRole: UserRole) {
  return canModerateAuthor(actorRole, targetRole);
}

export function staffCanSeeEmail(role: UserRole) {
  return role === "ADMIN";
}
