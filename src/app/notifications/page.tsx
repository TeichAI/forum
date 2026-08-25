import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { markNotificationsRead } from "@/actions/forum";
import { Avatar } from "@/components/ui/avatar";
import { SubmitButton } from "@/components/ui/submit-button";
import { RateLimitForm } from "@/components/ui/rate-limit-form";
import { UserRoleBadge } from "@/components/ui/user-role-badge";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const copy = { MENTION: "mentioned you", UPVOTE: "upvoted your post", FOLLOW: "started following you", MODERATION: "sent you a moderation update" } as const;

export default async function NotificationsPage() {
  const user = await requireUser();
  const notifications = await db.notification.findMany({ where: { recipientId: user.id }, include: { actor: { select: { id: true, displayName: true, imageUrl: true, role: true } }, thread: { select: { slug: true, title: true } }, reply: { select: { parentReplyId: true } }, moderationAction: { select: { type: true, reason: true } } }, orderBy: { createdAt: "desc" }, take: 100 });
  const href = (item: (typeof notifications)[number]) => item.thread && item.moderationAction?.type !== "HIDE" ? `/t/${item.thread.slug}${item.replyId ? `#reply-${item.replyId}` : ""}` : item.type === "MODERATION" ? "/notifications" : item.actor ? `/members/${item.actor.id}` : "/notifications";
  return <div className="shell max-w-3xl py-9"><div className="flex items-end justify-between"><div><div className="eyebrow flex items-center gap-2"><Bell size={14} /> Inbox</div><h1 className="mt-1 text-3xl font-black">Notifications</h1></div>{notifications.some((item) => !item.readAt) && <RateLimitForm action={markNotificationsRead}><SubmitButton className="button button-secondary" pendingLabel="Updating…"><CheckCheck size={16} /> Mark all read</SubmitButton></RateLimitForm>}</div><div className="card mt-7 overflow-hidden">{notifications.length ? notifications.map((item) => <Link key={item.id} href={href(item)} className="flex gap-3 border-b p-4 last:border-0 sm:p-5" style={{ borderColor: "var(--line)", background: item.readAt ? undefined : "var(--brand-soft)" }}><Avatar src={item.actor?.imageUrl} name={item.actor?.displayName ?? "Teich"} /><div className="min-w-0 flex-1 text-sm"><p><strong>{item.actor?.displayName ?? "Teich"}</strong>{item.actor && <UserRoleBadge role={item.actor.role} className="mx-1" />} {item.moderationAction ? <><span className="lowercase">{item.moderationAction.type.replaceAll("_", " ")}</span> your content or account</> : <>{item.type === "REPLY" ? item.reply?.parentReplyId ? "replied to your reply" : "replied to your discussion" : copy[item.type]}{item.thread && <> in <strong>{item.thread.title}</strong></>}</>}</p>{item.moderationAction && <p className="mt-1 text-xs muted">Reason: {item.moderationAction.reason}</p>}<time className="mt-1 block text-xs muted">{formatDistanceToNow(item.createdAt, { addSuffix: true })}</time></div>{!item.readAt && <span className="mt-2 h-2 w-2 rounded-full" style={{ background: "var(--brand)" }} />}</Link>) : <div className="p-12 text-center"><h2 className="font-bold">You are all caught up</h2><p className="mt-1 muted">New replies, mentions, follows, and moderation updates will appear here.</p></div>}</div></div>;
}
