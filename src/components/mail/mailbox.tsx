import Link from "next/link";
import { Archive, FilePenLine, Inbox, Mail, Send, Shield, Star, Trash2 } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import {
  type MailFolder,
  type StaffMailFolder,
  getMailCounts,
  getStaffMailCounts,
  isMailUnread,
  listMail,
  listStaffMail,
} from "@/lib/mail";
import type { MailAccessViewer } from "@/lib/mail-access";
import { excerpt } from "@/lib/utils";

const folders = [
  { id: "inbox", label: "Inbox", icon: Inbox },
  { id: "starred", label: "Starred", icon: Star },
  { id: "sent", label: "Sent", icon: Send },
  { id: "drafts", label: "Drafts", icon: FilePenLine },
  { id: "archive", label: "Archive", icon: Archive },
  { id: "trash", label: "Trash", icon: Trash2 },
] as const;

const staffFolders = [
  { id: "inbox", label: "Inbox" },
  { id: "starred", label: "Starred" },
  { id: "archive", label: "Archive" },
  { id: "trash", label: "Trash" },
] as const;

function FolderRail({ active, counts, staffAccess, staffUnread }: { active: MailFolder; counts: Awaited<ReturnType<typeof getMailCounts>>; staffAccess: boolean; staffUnread: number }) {
  return <aside className="mail-folders border-r p-3" style={{ borderColor: "var(--line)" }} aria-label="Mail folders">
    <Link href="/mail/compose" className="button button-primary mb-3 w-full"><Mail size={16} aria-hidden /> Compose</Link>
    <nav className="space-y-1">{folders.map(({ id, label, icon: Icon }) => {
      const count = id === "inbox" ? counts.unread : counts[id];
      return <Link key={id} href={`/mail?folder=${id}`} aria-current={active === id ? "page" : undefined} className={`mail-folder-link ${active === id ? "mail-folder-active" : ""}`}><Icon size={16} aria-hidden /><span>{label}</span>{count > 0 && <span className="pill ml-auto" aria-label={`${count} ${id === "inbox" ? "unread" : label.toLowerCase()}`}>{count}</span>}</Link>;
    })}{staffAccess && <Link href="/mail?folder=staff" aria-current={active === "staff" ? "page" : undefined} className={`mail-folder-link mt-3 border-t pt-3 ${active === "staff" ? "mail-folder-active" : ""}`} style={{ borderColor: "var(--line)" }}><Shield size={16} aria-hidden /><span>Staff Inbox</span>{staffUnread > 0 && <span className="pill ml-auto" aria-label={`${staffUnread} unread staff mail`}>{staffUnread}</span>}</Link>}</nav>
  </aside>;
}

function ListHeader({ folder, staffFolder, query }: { folder: MailFolder; staffFolder: StaffMailFolder; query: string }) {
  const title = folder === "staff" ? "Staff Inbox" : folders.find((item) => item.id === folder)?.label ?? "Inbox";
  return <header className="border-b p-4" style={{ borderColor: "var(--line)" }}><div className="flex items-center justify-between gap-3"><div><div className="eyebrow">Teich Mail</div><h1 className="mt-1 text-xl font-black">{title}</h1></div><Link className="button button-primary mobile-only !h-9 !w-9 !p-0" href="/mail/compose" aria-label="Compose mail"><Mail size={16} /></Link></div>
    {folder === "staff" && <nav className="mt-3 flex flex-wrap gap-1" aria-label="Staff Inbox folders">{staffFolders.map((item) => <Link key={item.id} href={`/mail?folder=staff&staffFolder=${item.id}`} aria-current={staffFolder === item.id ? "page" : undefined} className={`pill ${staffFolder === item.id ? "pill-strong" : ""}`}>{item.label}</Link>)}</nav>}
    <form action="/mail" className="mt-3"><input type="hidden" name="folder" value={folder} />{folder === "staff" && <input type="hidden" name="staffFolder" value={staffFolder} />}<input className="input !py-2 text-sm" type="search" name="q" defaultValue={query} placeholder={folder === "staff" ? "Search Staff Inbox" : "Search mail"} aria-label="Search mail" /></form>
  </header>;
}

type MailListResult = Awaited<ReturnType<typeof listMail>> | Awaited<ReturnType<typeof listStaffMail>>;

function mailHref(threadId: string, folder: MailFolder, staffFolder: StaffMailFolder, query: string) {
  return `/mail/${threadId}?folder=${folder}${folder === "staff" ? `&staffFolder=${staffFolder}` : ""}${query ? `&q=${encodeURIComponent(query)}` : ""}`;
}

function listHref(folder: MailFolder, staffFolder: StaffMailFolder, query: string, cursor?: string) {
  return `/mail?folder=${folder}${folder === "staff" ? `&staffFolder=${staffFolder}` : ""}${cursor ? `&cursor=${cursor}` : ""}${query ? `&q=${encodeURIComponent(query)}` : ""}`;
}

function MailList({ viewer, folder, staffFolder, query, cursor, result, selectedId }: { viewer: MailAccessViewer; folder: MailFolder; staffFolder: StaffMailFolder; query: string; cursor?: string; result: MailListResult; selectedId?: string }) {
  const listLabel = folder === "staff" ? `${staffFolder} staff mail list` : `${folder} mail list`;
  return <section className="mail-list border-r" style={{ borderColor: "var(--line)" }} aria-label={listLabel}>
    <ListHeader folder={folder} staffFolder={staffFolder} query={query} />
    <div>{result.kind === "drafts" ? result.items.map((draft) => {
      const recipient = draft.recipients[0]?.recipient;
      return <Link className="mail-row" href={`/mail/compose?draft=${draft.id}`} key={draft.id}><span className="pill" style={{ color: "var(--brand-dark)" }}>Draft</span><div className="min-w-0 flex-1"><div className="flex justify-between gap-2"><strong className="truncate text-sm">{draft.staffMailbox ? "Staff Mailbox" : recipient?.displayName ?? "No recipient"}</strong><time className="shrink-0 text-[11px] muted">{formatDistanceToNow(draft.updatedAt, { addSuffix: true })}</time></div><p className="truncate text-sm font-semibold">{draft.subject || "(No subject)"}</p><p className="truncate text-xs muted">{excerpt(draft.body, 90) || "Empty draft"}</p></div></Link>;
    }) : result.items.map((mailboxState) => {
      const staffThread = mailboxState.accessContext === "staff";
      const other = staffThread
        ? mailboxState.thread.participants[0]?.user
        : mailboxState.thread.staffMailbox
          ? null
          : mailboxState.thread.participants.find((item) => item.userId !== viewer.id)?.user;
      const displayName = staffThread ? other?.displayName ?? "Teich member" : mailboxState.thread.staffMailbox ? "Staff Mailbox" : other?.displayName ?? "Teich member";
      const last = mailboxState.thread.entries[0];
      const unread = isMailUnread(mailboxState);
      const preview = last ? `${last.authorId === viewer.id ? "You: " : staffThread ? `${last.author.displayName}: ` : ""}${excerpt(last.body, 90)}` : "No mail yet";
      return <Link className={`mail-row ${selectedId === mailboxState.threadId ? "mail-row-selected" : ""} ${unread ? "mail-row-unread" : ""}`} href={mailHref(mailboxState.threadId, folder, staffFolder, query)} key={mailboxState.threadId} aria-label={`${unread ? "Unread: " : ""}${mailboxState.thread.subject}`}><span className="mt-2 h-2 w-2 shrink-0 rounded-full" style={{ background: unread ? "var(--brand)" : "transparent" }} aria-hidden /><div className="min-w-0 flex-1"><div className="flex justify-between gap-2"><strong className="truncate text-sm">{displayName}</strong><time className="shrink-0 text-[11px] muted" title={format(mailboxState.thread.lastActivityAt, "PPpp")}>{formatDistanceToNow(mailboxState.thread.lastActivityAt, { addSuffix: true })}</time></div><p className="truncate text-sm font-semibold">{mailboxState.thread.subject}</p><p className="truncate text-xs muted">{preview}</p></div>{mailboxState.starred && <Star size={14} fill="currentColor" style={{ color: "var(--brand)" }} aria-label="Starred" />}</Link>;
    })}</div>
    {!result.items.length && <div className="empty-state min-h-64"><Mail size={28} className="muted" /><h3>{query ? "No matching mail" : folder === "drafts" ? "No drafts" : folder === "staff" ? `No staff ${staffFolder} mail` : `No ${folder} mail`}</h3><p>{query ? "Try another name, subject, or phrase." : folder === "staff" ? "Shared staff mail will appear here." : folder === "inbox" ? "New private mail will appear here." : "This folder is empty."}</p></div>}
    {result.nextCursor && <div className="border-t p-3" style={{ borderColor: "var(--line)" }}><Link className="button button-secondary w-full" href={listHref(folder, staffFolder, query, result.nextCursor)}>Load more</Link></div>}
    {cursor && <div className="p-3 pt-0"><Link className="button button-ghost w-full" href={listHref(folder, staffFolder, query)}>Back to newest</Link></div>}
  </section>;
}

export async function Mailbox({ viewer, folder, staffFolder = "inbox", staffAccess, query = "", cursor, selectedId, children }: { viewer: MailAccessViewer; folder: MailFolder; staffFolder?: StaffMailFolder; staffAccess: boolean; query?: string; cursor?: string; selectedId?: string; children?: React.ReactNode }) {
  const [counts, staffCounts, result] = await Promise.all([
    getMailCounts(viewer.id),
    staffAccess ? getStaffMailCounts(viewer) : Promise.resolve({ inbox: 0, unread: 0, starred: 0, archive: 0, trash: 0 }),
    folder === "staff" && staffAccess ? listStaffMail(viewer, { folder: staffFolder, query, cursor }) : listMail(viewer.id, { folder, query, cursor }),
  ]);
  return <div className={`mail-shell card ${selectedId ? "mail-reader-open" : ""}`}><FolderRail active={folder} counts={counts} staffAccess={staffAccess} staffUnread={staffCounts.unread} /><MailList viewer={viewer} folder={folder} staffFolder={staffFolder} query={query} cursor={cursor} result={result} selectedId={selectedId} /><main className="mail-reader">{children ?? <div className="empty-state h-full"><Mail size={34} className="muted" /><h3>Select a message</h3><p>Choose mail from the list to read the full thread.</p></div>}</main></div>;
}
