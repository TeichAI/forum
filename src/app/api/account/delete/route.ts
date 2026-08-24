import { auth, clerkClient, reverificationErrorResponse } from "@clerk/nextjs/server";
import { z } from "zod";
import { db } from "@/lib/db";

const deleteSchema = z.object({ confirmation: z.string().min(1) });
const reverification = { level: "multi_factor", afterMinutes: 10 } as const;

export async function POST(request: Request) {
  const authResult = await auth();
  if (!authResult.userId) return Response.json({ error: "You must be signed in." }, { status: 401 });

  const localUser = await db.user.findUnique({ where: { clerkId: authResult.userId } });
  if (!localUser || localUser.status !== "ACTIVE") return Response.json({ error: "Account not found." }, { status: 404 });

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
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
