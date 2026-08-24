import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Avatar } from "@/components/ui/avatar";
import { UserRoleBadge } from "@/components/ui/user-role-badge";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { excerpt } from "@/lib/utils";

export const dynamic = "force-dynamic";
export default async function MessagesPage() {
  const user = await requireUser(); const conversations = await db.conversation.findMany({ where: { OR: [{ memberOneId: user.id }, { memberTwoId: user.id }] }, include: { memberOne: true, memberTwo: true, messages: { orderBy: { createdAt: "desc" }, take: 1 } }, orderBy: { lastMessageAt: "desc" } });
  return <div className="shell max-w-3xl py-9"><div className="eyebrow flex items-center gap-2"><MessageCircle size={14} /> Private</div><h1 className="mt-1 text-3xl font-black">Messages</h1><p className="mt-2 muted">Private one-to-one conversations with community members.</p><div className="card mt-7 overflow-hidden">{conversations.length ? conversations.map((conversation) => { const other = conversation.memberOneId === user.id ? conversation.memberTwo : conversation.memberOne; const last = conversation.messages[0]; return <Link href={`/messages/${conversation.id}`} key={conversation.id} className="flex items-center gap-3 border-b p-4 last:border-0 hover:bg-[var(--surface-soft)]" style={{ borderColor: "var(--line)" }}><Avatar src={other.imageUrl} name={other.displayName} /><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-3"><span className="flex min-w-0 items-center gap-2"><strong className="truncate">{other.displayName}</strong><UserRoleBadge role={other.role} /></span><time className="text-xs muted">{formatDistanceToNow(conversation.lastMessageAt, { addSuffix: true })}</time></div><p className="mt-1 truncate text-sm muted">{last ? excerpt(last.body, 90) : "Start the conversation"}</p></div></Link>; }) : <div className="p-12 text-center"><h2 className="font-bold">No conversations yet</h2><p className="mt-1 muted">Visit a member profile to start one.</p></div>}</div></div>;
}
