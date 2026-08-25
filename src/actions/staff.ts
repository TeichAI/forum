"use server";

import { ReportPriority, SpacePostingPolicy } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getVerifiedUserRole, requireAdmin, requireModerator } from "@/lib/auth";
import { db } from "@/lib/db";
import { canModerateRole } from "@/lib/moderation";
import { consumeUserMutation, rateLimitedActionState } from "@/lib/rate-limit";
import { slugify } from "@/lib/utils";

export type StaffActionState = {
  status: "idle" | "success" | "error" | "rate_limited";
  message?: string;
  retryAfterSeconds?: number;
  resetAt?: string;
};

const initialError = (message: string): StaffActionState => ({ status: "error", message });
const success = (message: string): StaffActionState => ({ status: "success", message });
const idSchema = z.string().cuid();
const reasonSchema = z.string().trim().min(2, "Enter a reason.").max(500);
const noteSchema = z.string().trim().min(2, "Enter a note.").max(2_000);

function refreshStaff(...paths: string[]) {
  revalidatePath("/staff");
  for (const path of paths) revalidatePath(path);
}

async function staffLimit(user: { clerkId: string; role: string }): Promise<StaffActionState | null> {
  const result = await consumeUserMutation(user);
  return result.allowed ? null : rateLimitedActionState(result);
}

export async function claimCase(_state: StaffActionState, formData: FormData): Promise<StaffActionState> {
  const moderator = await requireModerator();
  const limited = await staffLimit(moderator);
  if (limited) return limited;
  const parsed = idSchema.safeParse(formData.get("caseId"));
  if (!parsed.success) return initialError("Choose a valid case.");
  const result = await db.$transaction(async (tx) => {
    const reportCase = await tx.moderationCase.findUnique({ where: { id: parsed.data } });
    if (!reportCase || reportCase.status === "RESOLVED" || reportCase.status === "DISMISSED") {
      return initialError("This case is already closed.");
    }
    if (reportCase.assignedToId && reportCase.assignedToId !== moderator.id) {
      return initialError("This case is already assigned to another staff member.");
    }

    const claim = !reportCase.assignedToId;
    const changed = await tx.moderationCase.updateMany({
      where: claim
        ? { id: reportCase.id, assignedToId: null, status: { in: ["OPEN", "IN_REVIEW"] } }
        : { id: reportCase.id, assignedToId: moderator.id, status: "IN_REVIEW" },
      data: { assignedToId: claim ? moderator.id : null, status: claim ? "IN_REVIEW" : "OPEN" },
    });
    if (changed.count !== 1) {
      const current = await tx.moderationCase.findUnique({ where: { id: reportCase.id } });
      if (!current || current.status === "RESOLVED" || current.status === "DISMISSED") {
        return initialError("This case is already closed.");
      }
      return initialError("This case is already assigned to another staff member.");
    }

    await tx.moderationAction.create({
      data: {
        type: claim ? "CLAIM_REPORT" : "UNCLAIM_REPORT",
        moderatorId: moderator.id,
        caseId: reportCase.id,
        targetType: reportCase.targetType,
        targetId: reportCase.targetId,
        reason: claim ? "Case claimed" : "Case returned to queue",
      },
    });
    return success(claim ? "Case assigned to you." : "Case returned to the queue.");
  });
  if (result.status === "success") refreshStaff(`/staff/reports/${parsed.data}`);
  return result;
}

export async function setCasePriority(_state: StaffActionState, formData: FormData): Promise<StaffActionState> {
  const moderator = await requireModerator();
  const limited = await staffLimit(moderator);
  if (limited) return limited;
  const parsed = z.object({ caseId: idSchema, priority: z.nativeEnum(ReportPriority) }).safeParse({
    caseId: formData.get("caseId"), priority: formData.get("priority"),
  });
  if (!parsed.success) return initialError("Choose a valid priority.");
  const reportCase = await db.moderationCase.findUnique({ where: { id: parsed.data.caseId } });
  if (!reportCase) return initialError("Case not found.");
  await db.$transaction([
    db.moderationCase.update({ where: { id: reportCase.id }, data: { priority: parsed.data.priority } }),
    db.moderationAction.create({ data: {
      type: "SET_PRIORITY", moderatorId: moderator.id, caseId: reportCase.id,
      targetType: reportCase.targetType, targetId: reportCase.targetId,
      reason: `Priority set to ${parsed.data.priority.toLowerCase()}`,
    } }),
  ]);
  refreshStaff(`/staff/reports/${reportCase.id}`);
  return success("Priority updated.");
}

export async function closeCase(_state: StaffActionState, formData: FormData): Promise<StaffActionState> {
  const moderator = await requireModerator();
  const limited = await staffLimit(moderator);
  if (limited) return limited;
  const parsed = z.object({
    caseId: idSchema,
    decision: z.enum(["RESOLVED", "DISMISSED", "REOPEN"]),
    reason: reasonSchema,
  }).safeParse({ caseId: formData.get("caseId"), decision: formData.get("decision"), reason: formData.get("reason") });
  if (!parsed.success) return initialError(parsed.error.issues[0]?.message ?? "Check the case decision.");
  const reportCase = await db.moderationCase.findUnique({ where: { id: parsed.data.caseId } });
  if (!reportCase) return initialError("Case not found.");
  const reopen = parsed.data.decision === "REOPEN";
  if (reopen && reportCase.status !== "RESOLVED" && reportCase.status !== "DISMISSED") return initialError("Only a closed case can be reopened.");
  if (!reopen && (reportCase.status === "RESOLVED" || reportCase.status === "DISMISSED")) return initialError("This case is already closed.");
  const status: "OPEN" | "RESOLVED" | "DISMISSED" = reopen ? "OPEN" : parsed.data.decision as "RESOLVED" | "DISMISSED";
  const type = reopen ? "REOPEN_REPORT" : status === "RESOLVED" ? "RESOLVE_REPORT" : "DISMISS_REPORT";
  await db.$transaction([
    db.moderationCase.update({
      where: { id: reportCase.id },
      data: {
        status,
        resolution: reopen ? null : parsed.data.reason,
        closedAt: reopen ? null : new Date(),
        assignedToId: reopen ? null : (reportCase.assignedToId ?? moderator.id),
      },
    }),
    db.moderationAction.create({ data: {
      type, moderatorId: moderator.id, caseId: reportCase.id,
      targetType: reportCase.targetType, targetId: reportCase.targetId, reason: parsed.data.reason,
    } }),
  ]);
  refreshStaff(`/staff/reports/${reportCase.id}`);
  return success(reopen ? "Case reopened." : `Case ${status.toLowerCase()}.`);
}

export async function addStaffNote(_state: StaffActionState, formData: FormData): Promise<StaffActionState> {
  const moderator = await requireModerator();
  const limited = await staffLimit(moderator);
  if (limited) return limited;
  const parsed = z.object({
    caseId: idSchema.optional(),
    userId: idSchema.optional(),
    body: noteSchema,
  }).refine((value) => Boolean(value.caseId) !== Boolean(value.userId), "Choose exactly one note target.").safeParse({
    caseId: formData.get("caseId") || undefined,
    userId: formData.get("userId") || undefined,
    body: formData.get("body"),
  });
  if (!parsed.success) return initialError(parsed.error.issues[0]?.message ?? "Check the note.");
  let targetType: "REPORT" | "USER" = "REPORT";
  let targetId = parsed.data.caseId!;
  if (parsed.data.userId) {
    const target = await db.user.findUnique({ where: { id: parsed.data.userId } });
    if (!target) return initialError("Member not found.");
    if (target.status === "DELETED") return initialError("Deleted accounts cannot be moderated.");
    const verifiedRole = await getVerifiedUserRole(target);
    if (!verifiedRole || !canModerateRole(moderator.role, verifiedRole)) return initialError("You cannot add notes to this staff account.");
    targetType = "USER";
    targetId = target.id;
  } else if (!await db.moderationCase.findUnique({ where: { id: parsed.data.caseId! }, select: { id: true } })) {
    return initialError("Case not found.");
  }
  await db.$transaction([
    db.staffNote.create({ data: { authorId: moderator.id, caseId: parsed.data.caseId, userId: parsed.data.userId, body: parsed.data.body } }),
    db.moderationAction.create({ data: {
      type: "ADD_NOTE", moderatorId: moderator.id, caseId: parsed.data.caseId,
      userId: parsed.data.userId, targetType, targetId, reason: "Internal staff note added",
    } }),
  ]);
  refreshStaff(parsed.data.caseId ? `/staff/reports/${parsed.data.caseId}` : `/staff/members/${parsed.data.userId}`);
  return success("Private staff note added.");
}

export async function moderateContent(_state: StaffActionState, formData: FormData): Promise<StaffActionState> {
  const moderator = await requireModerator();
  const limited = await staffLimit(moderator);
  if (limited) return limited;
  const parsed = z.object({
    targetType: z.enum(["THREAD", "REPLY"]), targetId: idSchema,
    action: z.enum(["HIDE", "RESTORE", "LOCK", "UNLOCK", "PIN", "UNPIN"]), reason: reasonSchema,
  }).safeParse({
    targetType: formData.get("targetType"), targetId: formData.get("targetId"),
    action: formData.get("action"), reason: formData.get("reason"),
  });
  if (!parsed.success) return initialError(parsed.error.issues[0]?.message ?? "Check the moderation action.");
  if (parsed.data.targetType === "REPLY" && !["HIDE", "RESTORE"].includes(parsed.data.action)) return initialError("That action is unavailable for replies.");

  const target = parsed.data.targetType === "THREAD"
    ? await db.thread.findUnique({ where: { id: parsed.data.targetId }, select: { id: true, slug: true, authorId: true, status: true, isLocked: true, isPinned: true } })
    : await db.reply.findUnique({ where: { id: parsed.data.targetId }, select: { id: true, authorId: true, status: true, thread: { select: { slug: true, id: true } } } });
  if (!target) return initialError("Content not found.");
  if (parsed.data.action === "RESTORE" && target.status === "DELETED") return initialError("Member-deleted content cannot be restored by staff.");

  await db.$transaction(async (tx) => {
    if (parsed.data.targetType === "THREAD") {
      const data = parsed.data.action === "HIDE" ? { status: "HIDDEN" as const }
        : parsed.data.action === "RESTORE" ? { status: "PUBLISHED" as const }
          : parsed.data.action === "LOCK" ? { isLocked: true }
            : parsed.data.action === "UNLOCK" ? { isLocked: false }
              : parsed.data.action === "PIN" ? { isPinned: true } : { isPinned: false };
      await tx.thread.update({ where: { id: target.id }, data });
    } else {
      await tx.reply.update({ where: { id: target.id }, data: { status: parsed.data.action === "HIDE" ? "HIDDEN" : "PUBLISHED" } });
    }
    const action = await tx.moderationAction.create({ data: {
      type: parsed.data.action, moderatorId: moderator.id, userId: target.authorId,
      targetType: parsed.data.targetType, targetId: target.id, reason: parsed.data.reason,
    } });
    const threadId = parsed.data.targetType === "THREAD" ? target.id : "thread" in target ? target.thread.id : undefined;
    const replyId = parsed.data.targetType === "REPLY" ? target.id : undefined;
    await tx.notification.create({ data: {
      type: "MODERATION", recipientId: target.authorId, actorId: moderator.id,
      threadId, replyId, moderationActionId: action.id,
    } });
  });
  const slug = parsed.data.targetType === "THREAD" ? ("slug" in target ? target.slug : "") : ("thread" in target ? target.thread.slug : "");
  refreshStaff("/staff/content", `/t/${slug}`);
  return success(`${parsed.data.action.toLowerCase()} action completed.`);
}

export async function setMemberSuspension(_state: StaffActionState, formData: FormData): Promise<StaffActionState> {
  const moderator = await requireModerator();
  const limited = await staffLimit(moderator);
  if (limited) return limited;
  const parsed = z.object({
    userId: idSchema, action: z.enum(["SUSPEND", "UNSUSPEND"]),
    days: z.coerce.number().int().min(1).max(365).optional(), reason: reasonSchema,
  }).safeParse({
    userId: formData.get("userId"), action: formData.get("action"),
    days: formData.get("days") || undefined, reason: formData.get("reason"),
  });
  if (!parsed.success) return initialError(parsed.error.issues[0]?.message ?? "Check the suspension details.");
  const target = await db.user.findUnique({ where: { id: parsed.data.userId } });
  if (!target) return initialError("Member not found.");
  if (target.status === "DELETED") return initialError("Deleted accounts cannot be moderated.");
  const verifiedRole = await getVerifiedUserRole(target);
  if (!verifiedRole || !canModerateRole(moderator.role, verifiedRole)) return initialError("This staff account is protected.");
  if (parsed.data.action === "SUSPEND" && !parsed.data.days) return initialError("Choose a suspension duration.");
  const until = parsed.data.action === "SUSPEND" ? new Date(Date.now() + parsed.data.days! * 86_400_000) : null;
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: target.id }, data: {
      status: parsed.data.action === "SUSPEND" ? "SUSPENDED" : "ACTIVE",
      suspendedUntil: until, suspensionReason: parsed.data.action === "SUSPEND" ? parsed.data.reason : null,
    } });
    const action = await tx.moderationAction.create({ data: {
      type: parsed.data.action, moderatorId: moderator.id, userId: target.id,
      targetType: "USER", targetId: target.id, reason: parsed.data.reason,
      metadata: until ? { until: until.toISOString() } : undefined,
    } });
    await tx.notification.create({ data: {
      type: "MODERATION", recipientId: target.id, actorId: moderator.id, moderationActionId: action.id,
    } });
  });
  refreshStaff("/staff/members", `/staff/members/${target.id}`);
  return success(parsed.data.action === "SUSPEND" ? "Member suspended." : "Member restored.");
}

const spaceInput = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().min(2).max(280),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  postingPolicy: z.nativeEnum(SpacePostingPolicy),
});

export async function saveSpace(_state: StaffActionState, formData: FormData): Promise<StaffActionState> {
  const admin = await requireAdmin();
  const limited = await staffLimit(admin);
  if (limited) return limited;
  const id = z.string().cuid().optional().safeParse(formData.get("spaceId") || undefined);
  const values = spaceInput.safeParse({
    name: formData.get("name"), description: formData.get("description"), color: formData.get("color"), postingPolicy: formData.get("postingPolicy"),
  });
  if (!id.success || !values.success) return initialError("Check the space name, description, color, and posting permissions.");
  const duplicate = await db.category.findFirst({ where: { name: { equals: values.data.name, mode: "insensitive" }, id: id.data ? { not: id.data } : undefined } });
  if (duplicate) return initialError("A space with that name already exists.");
  const existing = id.data ? await db.category.findUnique({ where: { id: id.data } }) : null;
  const baseSlug = slugify(values.data.name) || "space";
  const slugTaken = existing ? null : await db.category.findUnique({ where: { slug: baseSlug }, select: { id: true } });
  const slug = existing?.slug ?? (slugTaken ? `${baseSlug}-${crypto.randomUUID().slice(0, 6)}` : baseSlug);
  const position = existing?.position ?? ((await db.category.aggregate({ _max: { position: true } }))._max.position ?? -1) + 1;
  const space = await db.category.upsert({
    where: { id: id.data ?? "new-space" },
    update: { ...values.data, color: values.data.color.toLowerCase() },
    create: { ...values.data, color: values.data.color.toLowerCase(), slug, position },
  });
  await db.moderationAction.create({ data: {
    type: existing ? "UPDATE_SPACE" : "CREATE_SPACE", moderatorId: admin.id,
    targetType: "SPACE", targetId: space.id, reason: existing ? "Space settings updated" : "Space created",
  } });
  refreshStaff("/staff/spaces", "/");
  return success(existing ? "Space updated." : "Space created.");
}

export async function changeSpaceState(_state: StaffActionState, formData: FormData): Promise<StaffActionState> {
  const admin = await requireAdmin();
  const limited = await staffLimit(admin);
  if (limited) return limited;
  const parsed = z.object({ spaceId: idSchema, action: z.enum(["ARCHIVE", "RESTORE", "UP", "DOWN"]) }).safeParse({
    spaceId: formData.get("spaceId"), action: formData.get("action"),
  });
  if (!parsed.success) return initialError("Choose a valid space action.");
  const space = await db.category.findUnique({ where: { id: parsed.data.spaceId } });
  if (!space) return initialError("Space not found.");
  if (parsed.data.action === "ARCHIVE" || parsed.data.action === "RESTORE") {
    const archive = parsed.data.action === "ARCHIVE";
    await db.$transaction([
      db.category.update({ where: { id: space.id }, data: { archivedAt: archive ? new Date() : null } }),
      db.moderationAction.create({ data: {
        type: archive ? "ARCHIVE_SPACE" : "RESTORE_SPACE", moderatorId: admin.id,
        targetType: "SPACE", targetId: space.id, reason: archive ? "Space archived" : "Space restored",
      } }),
    ]);
  } else {
    const direction = parsed.data.action === "UP" ? -1 : 1;
    const neighbor = await db.category.findFirst({
      where: direction < 0 ? { position: { lt: space.position } } : { position: { gt: space.position } },
      orderBy: { position: direction < 0 ? "desc" : "asc" },
    });
    if (!neighbor) return initialError("The space is already at the end of the list.");
    await db.$transaction([
      db.category.update({ where: { id: space.id }, data: { position: neighbor.position } }),
      db.category.update({ where: { id: neighbor.id }, data: { position: space.position } }),
      db.moderationAction.create({ data: {
        type: "REORDER_SPACE", moderatorId: admin.id, targetType: "SPACE", targetId: space.id,
        reason: `Space moved ${parsed.data.action.toLowerCase()}`,
      } }),
    ]);
  }
  refreshStaff("/staff/spaces", "/");
  return success(parsed.data.action === "ARCHIVE" ? "Space archived." : parsed.data.action === "RESTORE" ? "Space restored." : "Space order updated.");
}

export async function renameTag(_state: StaffActionState, formData: FormData): Promise<StaffActionState> {
  const admin = await requireAdmin();
  const limited = await staffLimit(admin);
  if (limited) return limited;
  const parsed = z.object({ tagId: idSchema, name: z.string().trim().min(1).max(50) }).safeParse({ tagId: formData.get("tagId"), name: formData.get("name") });
  if (!parsed.success) return initialError("Enter a valid tag name.");
  const duplicate = await db.tag.findFirst({ where: { name: { equals: parsed.data.name, mode: "insensitive" }, id: { not: parsed.data.tagId } } });
  if (duplicate) return initialError("A tag with that name already exists. Merge the tags instead.");
  const tag = await db.tag.update({ where: { id: parsed.data.tagId }, data: { name: parsed.data.name } }).catch(() => null);
  if (!tag) return initialError("Tag not found.");
  await db.moderationAction.create({ data: { type: "RENAME_TAG", moderatorId: admin.id, targetType: "TAG", targetId: tag.id, reason: `Tag renamed to ${tag.name}` } });
  refreshStaff("/staff/tags");
  return success("Tag renamed; its URL remains unchanged.");
}

export async function mergeTag(_state: StaffActionState, formData: FormData): Promise<StaffActionState> {
  const admin = await requireAdmin();
  const limited = await staffLimit(admin);
  if (limited) return limited;
  const parsed = z.object({ sourceId: idSchema, destinationId: idSchema }).refine((value) => value.sourceId !== value.destinationId).safeParse({
    sourceId: formData.get("sourceId"), destinationId: formData.get("destinationId"),
  });
  if (!parsed.success) return initialError("Choose two different tags.");
  const [source, destination] = await Promise.all([
    db.tag.findUnique({ where: { id: parsed.data.sourceId }, include: { threads: true } }),
    db.tag.findUnique({ where: { id: parsed.data.destinationId } }),
  ]);
  if (!source || !destination) return initialError("One of those tags no longer exists.");
  await db.$transaction(async (tx) => {
    await tx.threadTag.createMany({ data: source.threads.map((item) => ({ threadId: item.threadId, tagId: destination.id })), skipDuplicates: true });
    await tx.threadTag.deleteMany({ where: { tagId: source.id } });
    await tx.tagAlias.updateMany({ where: { tagId: source.id }, data: { tagId: destination.id } });
    await tx.tagAlias.upsert({ where: { slug: source.slug }, update: { tagId: destination.id }, create: { slug: source.slug, tagId: destination.id } });
    await tx.tag.delete({ where: { id: source.id } });
    await tx.moderationAction.create({ data: {
      type: "MERGE_TAG", moderatorId: admin.id, targetType: "TAG", targetId: destination.id,
      reason: `${source.name} merged into ${destination.name}`, metadata: { sourceId: source.id, sourceSlug: source.slug },
    } });
  });
  refreshStaff("/staff/tags", `/tag/${source.slug}`, `/tag/${destination.slug}`);
  return success("Tags merged and the old URL will redirect.");
}

function parseList(value: FormDataEntryValue | null) {
  return String(value ?? "").split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
}

export async function saveModerationSettings(_state: StaffActionState, formData: FormData): Promise<StaffActionState> {
  const admin = await requireAdmin();
  const limited = await staffLimit(admin);
  if (limited) return limited;
  const parsed = z.object({
    reportReasons: z.array(z.string().min(2).max(80)).min(1).max(20),
    actionReasons: z.array(z.string().min(2).max(80)).min(1).max(20),
    suspensionDurationsDays: z.array(z.coerce.number().int().min(1).max(365)).min(1).max(20),
  }).safeParse({
    reportReasons: [...new Set(parseList(formData.get("reportReasons")))],
    actionReasons: [...new Set(parseList(formData.get("actionReasons")))],
    suspensionDurationsDays: [...new Set(parseList(formData.get("suspensionDurationsDays")))],
  });
  if (!parsed.success) return initialError("Use 1–20 unique values; reasons must be 2–80 characters and durations 1–365 days.");
  await db.$transaction([
    db.moderationSettings.upsert({ where: { id: "default" }, update: parsed.data, create: { id: "default", ...parsed.data } }),
    db.moderationAction.create({ data: {
      type: "UPDATE_MODERATION_SETTINGS", moderatorId: admin.id, targetType: "SETTINGS", targetId: "default", reason: "Moderation presets updated",
    } }),
  ]);
  refreshStaff("/staff/settings/moderation", "/");
  return success("Moderation presets saved.");
}
