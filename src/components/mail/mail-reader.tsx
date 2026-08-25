import Link from "next/link";
import { notFound } from "next/navigation";
import { Archive, Ban, Inbox, MailOpen, RotateCcw, Star, Trash2, XCircle } from "lucide-react";
import { format } from "date-fns";
import { blockMember } from "@/actions/forum";
import { removeMailboxCopy, replyToMail, setMailLocation, setMailReadState, toggleMailStar } from "@/actions/mail";
import { ReportForm } from "@/components/forum/report-form";
import { Markdown } from "@/components/markdown";
import { MarkdownEditor } from "@/components/markdown-editor";
import { MailReadReceipt } from "@/components/mail/read-receipt";
import { Avatar } from "@/components/ui/avatar";
import { RateLimitForm } from "@/components/ui/rate-limit-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { UserRoleBadge } from "@/components/ui/user-role-badge";
import { getMailThread, isMailUnread } from "@/lib/mail";
import { db } from "@/lib/db";

export async function MailReader({ userId, threadId, folder }: { userId: string; threadId: string; folder: string }) {
  const participant = await getMailThread(userId, threadId);
  if (!participant) notFound();
  const other = participant.thread.participants.find((item) => item.userId !== userId)?.user;
  const block = other ? await db.block.findFirst({ where: { OR: [{ blockerId: userId, blockedId: other.id }, { blockerId: other.id, blockedId: userId }] }, select: { blockerId: true } }) : null;
  const blocked = Boolean(block) || participant.thread.participants.some((item) => item.user.status !== "ACTIVE");
  const unread = isMailUnread(participant);
  return <article className="flex h-full min-h-0 flex-col">
    <MailReadReceipt threadId={threadId} unread={unread} />
    <header className="border-b p-4 sm:p-5" style={{ borderColor: "var(--line)" }}><div className="flex items-start gap-3"><Link href={`/mail?folder=${folder}`} className="button button-ghost mobile-only !h-9 !w-9 !p-0" aria-label="Back to mail list">←</Link><div className="min-w-0 flex-1"><h1 className="text-xl font-black leading-tight">{participant.thread.subject}</h1>{other && <Link href={`/members/${other.id}`} className="mt-2 flex items-center gap-2 text-sm muted"><Avatar src={other.imageUrl} name={other.displayName} className="!h-7 !w-7" /><strong style={{ color: "var(--foreground)" }}>{other.displayName}</strong><span>@{other.username}</span><UserRoleBadge role={other.role} /></Link>}</div><div className="flex flex-wrap justify-end gap-1">
      <RateLimitForm action={toggleMailStar}><input type="hidden" name="threadId" value={threadId} /><SubmitButton className="button button-ghost !h-9 !w-9 !p-0" pendingLabel="…"><Star size={16} fill={participant.starred ? "currentColor" : "none"} /><span className="sr-only">{participant.starred ? "Unstar mail" : "Star mail"}</span></SubmitButton></RateLimitForm>
      <RateLimitForm action={setMailReadState}><input type="hidden" name="threadId" value={threadId} /><input type="hidden" name="unread" value="true" /><SubmitButton className="button button-ghost !h-9 !w-9 !p-0" pendingLabel="…"><MailOpen size={16} /><span className="sr-only">Mark unread</span></SubmitButton></RateLimitForm>
      {participant.location === "ARCHIVE" ? <LocationButton threadId={threadId} location="INBOX" label="Move to inbox"><Inbox size={16} /></LocationButton> : participant.location === "TRASH" ? <LocationButton threadId={threadId} location="INBOX" label="Restore from trash"><RotateCcw size={16} /></LocationButton> : <LocationButton threadId={threadId} location="ARCHIVE" label="Archive mail"><Archive size={16} /></LocationButton>}
      {participant.location === "TRASH" ? <RateLimitForm action={removeMailboxCopy}><input type="hidden" name="threadId" value={threadId} /><SubmitButton className="button button-danger !h-9 !w-9 !p-0" pendingLabel="…"><XCircle size={16} /><span className="sr-only">Delete forever</span></SubmitButton></RateLimitForm> : <LocationButton threadId={threadId} location="TRASH" label="Move to trash"><Trash2 size={16} /></LocationButton>}
      {other && <details className="relative"><summary className="button button-ghost !h-9 !w-9 !p-0 list-none" aria-label="Mail safety options">•••</summary><div className="card absolute right-0 top-10 z-20 w-56 p-3"><RateLimitForm action={blockMember}><input type="hidden" name="userId" value={other.id} /><SubmitButton className="button button-danger w-full" pendingLabel="Blocking…"><Ban size={15} /> Block member</SubmitButton></RateLimitForm></div></details>}
    </div></div></header>
    <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6"><div className="space-y-4">{participant.thread.entries.map((entry) => <section key={entry.id} className="rounded-xl border p-4" style={{ borderColor: "var(--line)", background: entry.authorId === userId ? "var(--brand-soft)" : "var(--surface-soft)" }}><header className="mb-3 flex flex-wrap items-center gap-2 text-xs muted"><Avatar src={entry.author.imageUrl} name={entry.author.displayName} className="!h-7 !w-7" /><strong style={{ color: "var(--foreground)" }}>{entry.authorId === userId ? "You" : entry.author.displayName}</strong><span>@{entry.author.username}</span><time className="ml-auto">{format(entry.createdAt, "PPp")}</time>{entry.authorId !== userId && <ReportForm targetType="MAIL_ENTRY" targetId={entry.id} returnTo={`/mail/${threadId}`} />}</header><Markdown>{entry.body}</Markdown></section>)}</div></div>
    <footer className="border-t p-4" style={{ borderColor: "var(--line)" }}>{blocked ? <p className="rounded-xl p-3 text-sm muted" style={{ background: "var(--surface-soft)" }}>You can read this thread, but replies are unavailable because one member blocked the other or the recipient is inactive.</p> : <RateLimitForm action={replyToMail}><input type="hidden" name="threadId" value={threadId} /><MarkdownEditor rows={3} placeholder={`Reply to ${other?.displayName ?? "this thread"}…`} /><div className="mt-3 flex justify-end"><SubmitButton pendingLabel="Sending…">Send reply</SubmitButton></div></RateLimitForm>}</footer>
  </article>;
}

function LocationButton({ threadId, location, label, children }: { threadId: string; location: "INBOX" | "ARCHIVE" | "TRASH"; label: string; children: React.ReactNode }) {
  return <RateLimitForm action={setMailLocation}><input type="hidden" name="threadId" value={threadId} /><input type="hidden" name="location" value={location} /><SubmitButton className="button button-ghost !h-9 !w-9 !p-0" pendingLabel="…">{children}<span className="sr-only">{label}</span></SubmitButton></RateLimitForm>;
}
