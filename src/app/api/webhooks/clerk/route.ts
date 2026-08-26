import { type WebhookEvent } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import { Webhook } from "svix";
import { db } from "@/lib/db";
import { normalizeClerkRole } from "@/lib/roles";
import { provisionClerkUser } from "@/lib/user-provisioning";
import { optionalRuntimeSecret } from "@/lib/env";

export async function POST(request: Request) {
  const secret = optionalRuntimeSecret("CLERK_WEBHOOK_SECRET");
  if (!secret) return Response.json({ error: "Webhook endpoint is disabled" }, { status: 404 });
  const headerList = await headers();
  const svixId = headerList.get("svix-id");
  const svixTimestamp = headerList.get("svix-timestamp");
  const svixSignature = headerList.get("svix-signature");
  if (!svixId || !svixTimestamp || !svixSignature) return Response.json({ error: "Missing signature" }, { status: 400 });

  let event: WebhookEvent;
  try {
    event = new Webhook(secret).verify(await request.text(), {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as WebhookEvent;
  } catch {
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "user.deleted") {
    if (event.data.id) await db.user.updateMany({ where: { clerkId: event.data.id }, data: { status: "DELETED", deletedAt: new Date(), email: null } });
    return Response.json({ ok: true });
  }

  if (event.type === "user.created" || event.type === "user.updated") {
    const data = event.data;
    const role = normalizeClerkRole(data.public_metadata?.role);
    const preferred = data.username || [data.first_name, data.last_name].filter(Boolean).join(" ") || `member_${data.id.slice(-8)}`;
    const email = data.email_addresses.find((item) => item.id === data.primary_email_address_id)?.email_address;
    await provisionClerkUser({
      clerkId: data.id,
      preferredUsername: preferred,
      displayName: [data.first_name, data.last_name].filter(Boolean).join(" "),
      email,
      imageUrl: data.image_url,
      role,
    });
  }
  return Response.json({ ok: true });
}
