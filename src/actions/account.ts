"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { consumeUserMutation, RATE_LIMIT_POLICIES, rateLimitedActionState } from "@/lib/rate-limit";

const profileSchema = z.object({
  displayName: z.string().trim().min(1, "Enter a display name.").max(60, "Display names must be 60 characters or fewer."),
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,30}$/, "Use 3–30 lowercase letters, numbers, or underscores."),
  bio: z.string().trim().max(500, "Bios must be 500 characters or fewer."),
});

export type AccountActionState = {
  status: "idle" | "success" | "error" | "rate_limited";
  message?: string;
  fieldErrors?: Partial<Record<"displayName" | "username" | "bio", string>>;
  retryAfterSeconds?: number;
  resetAt?: string;
};

export async function updateAccountProfile(_state: AccountActionState, formData: FormData): Promise<AccountActionState> {
  const user = await requireUser();
  const rateLimit = await consumeUserMutation(user, RATE_LIMIT_POLICIES.account);
  if (!rateLimit.allowed) return rateLimitedActionState(rateLimit);
  const parsed = profileSchema.safeParse({
    displayName: formData.get("displayName"),
    username: formData.get("username"),
    bio: formData.get("bio") ?? "",
  });

  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    return {
      status: "error",
      message: "Check the highlighted fields and try again.",
      fieldErrors: {
        displayName: errors.displayName?.[0],
        username: errors.username?.[0],
        bio: errors.bio?.[0],
      },
    };
  }

  try {
    await db.user.update({ where: { id: user.id }, data: parsed.data });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      return { status: "error", message: "That username is already in use.", fieldErrors: { username: "Choose another username." } };
    }
    return { status: "error", message: "We couldn’t save your profile. Please try again." };
  }

  revalidatePath("/");
  revalidatePath("/settings");
  revalidatePath(`/members/${user.id}`);
  return { status: "success", message: "Profile saved." };
}

export type SyncedAccountIdentity = {
  ok: boolean;
  email?: string | null;
  imageUrl?: string | null;
  message?: string;
  retryAfterSeconds?: number;
  resetAt?: string;
};

export async function syncAccountIdentity(): Promise<SyncedAccountIdentity> {
  const localUser = await requireUser();
  const rateLimit = await consumeUserMutation(localUser, RATE_LIMIT_POLICIES.account);
  if (!rateLimit.allowed) {
    const limited = rateLimitedActionState(rateLimit);
    return { ok: false, message: limited.message, retryAfterSeconds: limited.retryAfterSeconds, resetAt: limited.resetAt };
  }
  const { userId } = await auth();
  if (!userId || userId !== localUser.clerkId) return { ok: false, message: "Your account session is no longer available." };

  try {
    const client = await clerkClient();
    const clerkUser = await client.users.getUser(userId);
    const email = clerkUser.emailAddresses.find((item) => item.id === clerkUser.primaryEmailAddressId)?.emailAddress ?? null;
    const imageUrl = clerkUser.imageUrl ?? null;
    await db.user.update({ where: { id: localUser.id }, data: { email, imageUrl } });
    revalidatePath("/");
    revalidatePath("/settings");
    revalidatePath(`/members/${localUser.id}`);
    return { ok: true, email, imageUrl };
  } catch {
    return { ok: false, message: "The account changed, but the forum profile could not be refreshed. Please try again." };
  }
}
