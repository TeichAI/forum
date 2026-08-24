import { type WebhookEvent } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import { Webhook } from "svix";
import { db } from "@/lib/db";
import { slugify } from "@/lib/utils";

function bootstrapRole(clerkId: string) {
  const admins = (process.env.ADMIN_CLERK_USER_IDS ?? "").split(",").map((id) => id.trim());
  return admins.includes(clerkId) ? "ADMIN" as const : "MEMBER" as const;
}

export async function POST(request: Request) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) return Response.json({ error: "Webhook secret is not configured" }, { status: 500 });
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
    const current = await db.user.findUnique({ where: { clerkId: data.id } });
    const preferred = data.username || [data.first_name, data.last_name].filter(Boolean).join(" ") || `member_${data.id.slice(-8)}`;
    let username = current?.username ?? slugify(preferred).replace(/-/g, "_").slice(0, 30);
    const collision = await db.user.findUnique({ where: { username } });
    if (collision && collision.clerkId !== data.id) username = `member_${data.id.slice(-8)}`;
    const email = data.email_addresses.find((item) => item.id === data.primary_email_address_id)?.email_address;
    await db.user.upsert({
      where: { clerkId: data.id },
      update: { email, displayName: [data.first_name, data.last_name].filter(Boolean).join(" ") || username, imageUrl: data.image_url },
      create: { clerkId: data.id, email, username, displayName: [data.first_name, data.last_name].filter(Boolean).join(" ") || username, imageUrl: data.image_url, role: bootstrapRole(data.id) },
    });
  }
  return Response.json({ ok: true });
}
