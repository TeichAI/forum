import Link from "next/link";
import { Archive, FilePenLine, Inbox, Mail, Send, Star, Trash2 } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { MailFolder, getMailCounts, isMailUnread, listMail } from "@/lib/mail";
import { excerpt } from "@/lib/utils";

const folders = [
  { id: "inbox", label: "Inbox", icon: Inbox },
  { id: "starred", label: "Starred", icon: Star },
  { id: "sent", label: "Sent", icon: Send },
  { id: "drafts", label: "Drafts", icon: FilePenLine },
  { id: "archive", label: "Archive", icon: Archive },
  { id: "trash", label: "Trash", icon: Trash2 },
] as const;

function FolderRail({ active, counts }: { active: MailFolder; counts: Awaited<ReturnType<typeof getMailCounts>> }) {
  return <aside className="mail-folders border-r p-3" style={{ borderColor: "var(--line)" }} aria-label="Mail folders">
    <Link href="/mail/compose" className="button button-primary mb-3 w-full"><Mail size={16} aria-hidden /> Compose</Link>
    <nav className="space-y-1">{folders.map(({ id, label, icon: Icon }) => {
      const count = id === "inbox" ? counts.unread : counts[id];
      return <Link key={id} href={`/mail?folder=${id}`} aria-current={active === id ? "page" : undefined} className={`mail-folder-link ${active === id ? "mail-folder-active" : ""}`}><Icon size={16} aria-hidden /><span>{label}</span>{count > 0 && <span className="pill ml-auto" aria-label={`${count} ${id === "inbox" ? "unread" : label.toLowerCase()}`}>{count}</span>}</Link>;
    })}</nav>
  </aside>;
}

function ListHeader({ folder, query }: { folder: MailFolder; query: string }) {
  const title = folders.find((item) => item.id === folder)?.label ?? "Inbox";
  return <header className="border-b p-4" style={{ borderColor: "var(--line)" }}><div className="flex items-center justify-between gap-3"><div><div className="eyebrow">Teich Mail</div><h1 className="mt-1 text-xl font-black">{title}</h1></div><Link className="button button-primary mobile-only !h-9 !w-9 !p-0" href="/mail/compose" aria-label="Compose mail"><Mail size={16} /></Link></div><form action="/mail" className="mt-3"><input type="hidden" name="folder" value={folder} /><input className="input !py-2 text-sm" type="search" name="q" defaultValue={query} placeholder="Search mail" aria-label="Search mail" /></form></header>;
}

function MailList({ userId, folder, query, cursor, result, selectedId }: { userId: string; folder: MailFolder; query: string; cursor?: string; result: Awaited<ReturnType<typeof listMail>>; selectedId?: string }) {
  return <section className="mail-list border-r" style={{ borderColor: "var(--line)" }} aria-label={`${folder} mail list`}>
    <ListHeader folder={folder} query={query} />
    <div>{result.kind === "drafts" ? result.items.map((draft) => {
      const recipient = draft.recipients[0]?.recipient;
      return <Link className="mail-row" href={`/mail/compose?draft=${draft.id}`} key={draft.id}><span className="pill" style={{ color: "var(--brand-dark)" }}>Draft</span><div className="min-w-0 flex-1"><div className="flex justify-between gap-2"><strong className="truncate text-sm">{recipient?.displayName ?? "No recipient"}</strong><time className="shrink-0 text-[11px] muted">{formatDistanceToNow(draft.updatedAt, { addSuffix: true })}</time></div><p className="truncate text-sm font-semibold">{draft.subject || "(No subject)"}</p><p className="truncate text-xs muted">{excerpt(draft.body, 90) || "Empty draft"}</p></div></Link>;
    }) : result.items.map((participant) => {
      const other = participant.thread.participants.find((item) => item.userId !== userId)?.user;
      const last = participant.thread.entries[0];
      const unread = isMailUnread(participant);
      return <Link className={`mail-row ${selectedId === participant.threadId ? "mail-row-selected" : ""} ${unread ? "mail-row-unread" : ""}`} href={`/mail/${participant.threadId}?folder=${folder}${query ? `&q=${encodeURIComponent(query)}` : ""}`} key={participant.threadId} aria-label={`${unread ? "Unread: " : ""}${participant.thread.subject}`}><span className="mt-2 h-2 w-2 shrink-0 rounded-full" style={{ background: unread ? "var(--brand)" : "transparent" }} aria-hidden /><div className="min-w-0 flex-1"><div className="flex justify-between gap-2"><strong className="truncate text-sm">{other?.displayName ?? "Teich member"}</strong><time className="shrink-0 text-[11px] muted" title={format(participant.thread.lastActivityAt, "PPpp")}>{formatDistanceToNow(participant.thread.lastActivityAt, { addSuffix: true })}</time></div><p className="truncate text-sm font-semibold">{participant.thread.subject}</p><p className="truncate text-xs muted">{last ? `${last.authorId === userId ? "You: " : ""}${excerpt(last.body, 90)}` : "No mail yet"}</p></div>{participant.starred && <Star size={14} fill="currentColor" style={{ color: "var(--brand)" }} aria-label="Starred" />}</Link>;
    })}</div>
    {!result.items.length && <div className="empty-state min-h-64"><Mail size={28} className="muted" /><h3>{query ? "No matching mail" : folder === "drafts" ? "No drafts" : `No ${folder} mail`}</h3><p>{query ? "Try another name, subject, or phrase." : folder === "inbox" ? "New private mail will appear here." : "This folder is empty."}</p></div>}
    {result.nextCursor && <div className="border-t p-3" style={{ borderColor: "var(--line)" }}><Link className="button button-secondary w-full" href={`/mail?folder=${folder}&cursor=${result.nextCursor}${query ? `&q=${encodeURIComponent(query)}` : ""}`}>Load more</Link></div>}
    {cursor && <div className="p-3 pt-0"><Link className="button button-ghost w-full" href={`/mail?folder=${folder}${query ? `&q=${encodeURIComponent(query)}` : ""}`}>Back to newest</Link></div>}
  </section>;
}

export async function Mailbox({ userId, folder, query = "", cursor, selectedId, children }: { userId: string; folder: MailFolder; query?: string; cursor?: string; selectedId?: string; children?: React.ReactNode }) {
  const [counts, result] = await Promise.all([getMailCounts(userId), listMail(userId, { folder, query, cursor })]);
  return <div className={`mail-shell card ${selectedId ? "mail-reader-open" : ""}`}><FolderRail active={folder} counts={counts} /><MailList userId={userId} folder={folder} query={query} cursor={cursor} result={result} selectedId={selectedId} /><main className="mail-reader">{children ?? <div className="empty-state h-full"><Mail size={34} className="muted" /><h3>Select a message</h3><p>Choose mail from the list to read the full thread.</p></div>}</main></div>;
}
