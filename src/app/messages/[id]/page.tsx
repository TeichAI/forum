import Link from "next/link";
import { notFound } from "next/navigation";
import { Ban } from "lucide-react";
import { format } from "date-fns";
import { blockMember, sendMessage } from "@/actions/forum";
import { Markdown } from "@/components/markdown";
import { MarkdownEditor } from "@/components/markdown-editor";
import { ReportForm } from "@/components/forum/report-form";
import { Avatar } from "@/components/ui/avatar";
import { SubmitButton } from "@/components/ui/submit-button";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(); const { id } = await params;
  const conversation = await db.conversation.findUnique({ where: { id }, include: { memberOne: true, memberTwo: true, messages: { where: { deletedAt: null }, orderBy: { createdAt: "asc" }, include: { author: true } } } });
  if (!conversation || (conversation.memberOneId !== user.id && conversation.memberTwoId !== user.id)) notFound();
  const other = conversation.memberOneId === user.id ? conversation.memberTwo : conversation.memberOne;
  await db.$transaction([db.message.updateMany({ where: { conversationId: id, authorId: { not: user.id }, readAt: null }, data: { readAt: new Date() } }), db.notification.updateMany({ where: { recipientId: user.id, conversationId: id, readAt: null }, data: { readAt: new Date() } })]);
  return <div className="shell max-w-3xl py-8"><div className="card overflow-hidden"><header className="flex items-center gap-3 border-b p-4 sm:p-5" style={{ borderColor: "var(--line)" }}><Link href="/messages" className="font-bold muted">←</Link><Link href={`/members/${other.id}`}><Avatar src={other.imageUrl} name={other.displayName} /></Link><div className="min-w-0 flex-1"><Link href={`/members/${other.id}`} className="font-extrabold">{other.displayName}</Link><div className="text-xs muted">@{other.username}</div></div><details><summary className="list-none cursor-pointer text-sm muted">•••</summary><div className="card absolute right-4 mt-2 w-64 space-y-3 p-4 shadow-xl"><form action={blockMember}><input type="hidden" name="userId" value={other.id} /><button className="button button-danger w-full"><Ban size={15} /> Block member</button></form><ReportForm targetType="USER" targetId={other.id} returnTo={`/messages/${id}`} /></div></details></header><div className="min-h-[360px] space-y-4 p-4 sm:p-6">{conversation.messages.length ? conversation.messages.map((message) => { const own = message.authorId === user.id; return <div key={message.id} className={`flex gap-2 ${own ? "flex-row-reverse" : ""}`}><Avatar src={message.author.imageUrl} name={message.author.displayName} className="!h-8 !w-8" /><div className="max-w-[78%]"><div className="rounded-2xl px-4 py-3 text-sm" style={{ background: own ? "var(--brand)" : "var(--surface-soft)", color: own ? "white" : "var(--foreground)" }}><Markdown>{message.body}</Markdown></div><div className={`mt-1 flex items-center gap-2 text-[11px] muted ${own ? "justify-end" : ""}`}><time>{format(message.createdAt, "MMM d, h:mm a")}</time>{!own && <ReportForm targetType="MESSAGE" targetId={message.id} returnTo={`/messages/${id}`} />}</div></div></div>; }) : <div className="grid min-h-[300px] place-items-center text-center muted">Say hello to {other.displayName}.</div>}</div><form action={sendMessage} className="border-t p-4" style={{ borderColor: "var(--line)" }}><input type="hidden" name="conversationId" value={conversation.id} /><MarkdownEditor rows={3} placeholder={`Message ${other.displayName}…`} /><div className="mt-3 flex justify-end"><SubmitButton pendingLabel="Sending…">Send message</SubmitButton></div></form></div></div>;
}
