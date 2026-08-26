import { auth, clerkClient, reverificationErrorResponse } from "@clerk/nextjs/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { consumeUserMutation, RATE_LIMIT_POLICIES, rateLimitedActionState } from "@/lib/rate-limit";
import { BodyTooLargeError, readBoundedBody } from "@/lib/bounded-body";
import { applicationUrl } from "@/lib/env";

const deleteSchema = z.object({ confirmation: z.string().min(1) });
const reverification = { level: "multi_factor", afterMinutes: 10 } as const;

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  try {
    if (!origin || new URL(origin).origin !== origin || origin !== applicationUrl().origin) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
  } catch {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const authResult = await auth();
  if (!authResult.userId) return Response.json({ error: "You must be signed in." }, { status: 401 });

  const localUser = await db.user.findUnique({ where: { clerkId: authResult.userId } });
  if (!localUser || localUser.status !== "ACTIVE") return Response.json({ error: "Account not found." }, { status: 404 });

  const rateLimit = await consumeUserMutation(localUser, RATE_LIMIT_POLICIES.accountDelete);
  if (!rateLimit.allowed) {
    const limited = rateLimitedActionState(rateLimit);
    if (rateLimit.outcome === "storage_unavailable") {
      return Response.json(
        { error: limited.message },
        { status: 503, headers: { "Retry-After": "30", "Cache-Control": "private, no-store" } },
      );
    }
    return Response.json(
      { error: limited.message, retryAfterSeconds: limited.retryAfterSeconds, resetAt: limited.resetAt },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds), "Cache-Control": "private, no-store" } },
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(await readBoundedBody(request, 4 * 1024));
  } catch (error) {
    if (error instanceof BodyTooLargeError) return Response.json({ error: "Payload too large" }, { status: 413 });
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = deleteSchema.safeParse(payload);
  if (!parsed.success || parsed.data.confirmation !== localUser.username) {
    return Response.json({ error: `Type ${localUser.username} exactly to confirm.` }, { status: 400 });
  }

  if (!authResult.has({ reverification })) return reverificationErrorResponse(reverification);

  try {
    const client = await clerkClient();
    const clerkUser = await client.users.getUser(authResult.userId);
    if (!clerkUser.deleteSelfEnabled) return Response.json({ error: "Account deletion is disabled." }, { status: 403 });
    await client.users.deleteUser(authResult.userId);
    await db.user.updateMany({
      where: { id: localUser.id },
      data: { status: "DELETED", deletedAt: new Date(), email: null },
    });
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "We couldn’t delete your account. Please try again." }, { status: 500 });
  }
}
