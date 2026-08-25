import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { addStaffNote, claimCase, closeCase, moderateContent, setCasePriority, setMemberSuspension } from "@/actions/staff";
import { Markdown } from "@/components/markdown";
import { StaffActionForm } from "@/components/staff/action-form";
import { requireModerator } from "@/lib/auth";
import { db } from "@/lib/db";
import { canModerateRole, getModerationSettings } from "@/lib/moderation";

async function TargetPreview({ type, id }: { type: string; id: string }) {
  if (type === "THREAD") {
    const item = await db.thread.findUnique({ where: { id }, include: { author: { select: { id: true, displayName: true, username: true } }, category: { select: { name: true } } } });
    if (!item) return <p className="muted">The reported discussion no longer exists.</p>;
    return <div><div className="flex flex-wrap gap-2 text-xs muted"><Link href={`/members/${item.author.id}`}>@{item.author.username}</Link><span>· {item.category.name}</span><span className="pill">{item.status.toLowerCase()}</span>{item.isLocked && <span className="pill">locked</span>}{item.isPinned && <span className="pill">pinned</span>}</div><Link href={`/t/${item.slug}`} className="mt-2 block text-xl font-black">{item.title}</Link><div className="prose mt-3 text-sm"><Markdown>{item.body}</Markdown></div></div>;
  }
  if (type === "REPLY") {
    const item = await db.reply.findUnique({ where: { id }, include: { author: { select: { id: true, username: true } }, thread: { select: { slug: true, title: true } } } });
    if (!item) return <p className="muted">The reported reply no longer exists.</p>;
    return <div><div className="flex flex-wrap gap-2 text-xs muted"><Link href={`/members/${item.author.id}`}>@{item.author.username}</Link><Link href={`/t/${item.thread.slug}#reply-${item.id}`}>in {item.thread.title}</Link><span className="pill">{item.status.toLowerCase()}</span></div><div className="prose mt-3 text-sm"><Markdown>{item.body}</Markdown></div></div>;
  }
  if (type === "USER") {
    const item = await db.user.findUnique({ where: { id }, select: { id: true, displayName: true, username: true, role: true, status: true, bio: true } });
    if (!item) return <p className="muted">The reported member no longer exists.</p>;
    return <div><Link href={`/staff/members/${item.id}`} className="text-xl font-black">{item.displayName}</Link><div className="mt-1 text-sm muted">@{item.username} · {item.role.toLowerCase()} · {item.status.toLowerCase()}</div><p className="mt-3 text-sm">{item.bio || "No profile bio."}</p></div>;
  }
  if (type === "MAIL_ENTRY") {
    const item = await db.mailEntry.findUnique({ where: { id }, include: { author: { select: { username: true } } } });
    if (!item) return <p className="muted">The reported mail entry no longer exists.</p>;
    const [before, after] = await Promise.all([
      db.mailEntry.findMany({ where: { threadId: item.threadId, createdAt: { lt: item.createdAt } }, include: { author: { select: { username: true } } }, orderBy: { createdAt: "desc" }, take: 2 }),
      db.mailEntry.findMany({ where: { threadId: item.threadId, createdAt: { gt: item.createdAt } }, include: { author: { select: { username: true } } }, orderBy: { createdAt: "asc" }, take: 2 }),
    ]);
    const context = [...before.reverse(), item, ...after];
    return <div><p className="mb-3 text-xs muted">Private context is limited to two mail entries on either side.</p>{context.map((entry) => <div key={entry.id} className={entry.id === item.id ? "rounded-xl border p-3" : "p-3 opacity-70"} style={entry.id === item.id ? { borderColor: "var(--brand)" } : undefined}><strong className="text-xs">@{entry.author.username}</strong><div className="prose mt-1 text-sm"><Markdown>{entry.body}</Markdown></div></div>)}</div>;
  }
  if (type === "LEGACY_MAIL") return <p className="muted">The original private content was removed during the Teich Mail migration. Reports, case notes, and audit actions were preserved.</p>;
  return <p className="muted">This target is not available for case review.</p>;
}

export default async function ReportCasePage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireModerator();
  const { id } = await params;
  const [reportCase, settings] = await Promise.all([
    db.moderationCase.findUnique({ where: { id }, include: {
      assignedTo: { select: { id: true, displayName: true } },
      reports: { include: { reporter: { select: { id: true, username: true, displayName: true } } }, orderBy: { createdAt: "asc" } },
      notes: { include: { author: { select: { displayName: true } } }, orderBy: { createdAt: "asc" } },
      actions: { include: { moderator: { select: { displayName: true } } }, orderBy: { createdAt: "desc" }, take: 20 },
    } }), getModerationSettings(),
  ]);
  if (!reportCase) notFound();
  const closed = reportCase.status === "RESOLVED" || reportCase.status === "DISMISSED";
  const reportedMember = reportCase.targetType === "USER"
    ? await db.user.findUnique({ where: { id: reportCase.targetId }, select: { role: true, status: true } })
    : null;
  const memberActionable = Boolean(reportedMember && reportedMember.status !== "DELETED" && canModerateRole(viewer.role, reportedMember.role));
  const targetPreview = await TargetPreview({ type: reportCase.targetType, id: reportCase.targetId });
  return (
    <div className="space-y-5">
      <div><Link href="/staff/reports" className="text-sm font-bold muted">← Report queue</Link><div className="mt-3 flex flex-wrap items-center gap-2"><span className={`pill priority-${reportCase.priority.toLowerCase()}`}>{reportCase.priority.toLowerCase()}</span><span className="pill">{reportCase.status.toLowerCase().replace("_", " ")}</span><span className="text-sm muted">{reportCase.targetType.toLowerCase()} · {reportCase.reports.length} reports</span></div></div>
      <section className="card p-5 sm:p-6"><div className="eyebrow">Reported target</div><div className="mt-4">{targetPreview}</div></section>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <section className="card p-5"><h2 className="text-lg font-black">Reports</h2><div className="mt-3 space-y-3">{reportCase.reports.map((report) => <article key={report.id} className="rounded-xl border p-4" style={{ borderColor: "var(--line)" }}><div className="flex justify-between gap-3 text-sm"><strong>{report.reason}</strong><time className="text-xs muted">{format(report.createdAt, "PPp")}</time></div><p className="mt-1 text-xs muted">{report.reporter.displayName} · @{report.reporter.username}</p>{report.details && <p className="mt-3 whitespace-pre-wrap text-sm">{report.details}</p>}</article>)}</div></section>
          <section className="card p-5"><h2 className="text-lg font-black">Private notes</h2><div className="my-3 space-y-3">{reportCase.notes.map((note) => <div key={note.id} className="rounded-xl p-3 text-sm" style={{ background: "var(--surface-soft)" }}><p className="whitespace-pre-wrap">{note.body}</p><p className="mt-2 text-xs muted">{note.author.displayName} · {format(note.createdAt, "PPp")}</p></div>)}{!reportCase.notes.length && <p className="text-sm muted">No internal notes yet.</p>}</div><StaffActionForm action={addStaffNote}><input type="hidden" name="caseId" value={reportCase.id} /><textarea className="input" name="body" rows={3} maxLength={2000} placeholder="Add context for other staff…" aria-label="Private case note" required /><button className="button button-secondary">Add private note</button></StaffActionForm></section>
        </div>
        <aside className="space-y-4">
          <section className="card p-4"><h2 className="font-black">Case controls</h2><StaffActionForm action={claimCase} className="mt-3 space-y-2"><input type="hidden" name="caseId" value={reportCase.id} /><button className="button button-secondary w-full" disabled={closed || Boolean(reportCase.assignedToId && reportCase.assignedToId !== viewer.id)}>{reportCase.assignedToId === viewer.id ? "Return to queue" : reportCase.assignedTo ? `Assigned to ${reportCase.assignedTo.displayName}` : "Claim case"}</button></StaffActionForm><StaffActionForm action={setCasePriority} className="mt-3 space-y-2"><input type="hidden" name="caseId" value={reportCase.id} /><select className="input" name="priority" defaultValue={reportCase.priority} aria-label="Case priority">{["LOW", "NORMAL", "HIGH", "URGENT"].map((priority) => <option key={priority}>{priority}</option>)}</select><button className="button button-secondary w-full">Update priority</button></StaffActionForm></section>
          {(reportCase.targetType === "THREAD" || reportCase.targetType === "REPLY") && <section className="card p-4"><h2 className="font-black">Content action</h2><StaffActionForm action={moderateContent} className="mt-3 space-y-2"><input type="hidden" name="targetType" value={reportCase.targetType} /><input type="hidden" name="targetId" value={reportCase.targetId} /><select className="input" name="action" aria-label="Content moderation action">{reportCase.targetType === "THREAD" ? ["HIDE", "RESTORE", "LOCK", "UNLOCK", "PIN", "UNPIN"].map((action) => <option key={action}>{action}</option>) : ["HIDE", "RESTORE"].map((action) => <option key={action}>{action}</option>)}</select><input className="input" name="reason" list="action-reasons" placeholder="Reason" aria-label="Content moderation reason" minLength={2} maxLength={500} required /><datalist id="action-reasons">{settings.actionReasons.map((reason) => <option key={reason} value={reason} />)}</datalist><button className="button button-danger w-full">Apply action</button></StaffActionForm></section>}
          {reportCase.targetType === "USER" && (memberActionable ? <section className="card p-4"><h2 className="font-black">Member action</h2><StaffActionForm action={setMemberSuspension} className="mt-3 space-y-2"><input type="hidden" name="userId" value={reportCase.targetId} /><select className="input" name="action" aria-label="Member moderation action"><option>SUSPEND</option><option>UNSUSPEND</option></select><select className="input" name="days" defaultValue="7" aria-label="Suspension duration">{settings.suspensionDurationsDays.map((days) => <option key={days} value={days}>{days} days</option>)}</select><input className="input" name="reason" list="member-action-reasons" placeholder="Reason" aria-label="Member moderation reason" required /><datalist id="member-action-reasons">{settings.actionReasons.map((reason) => <option key={reason} value={reason} />)}</datalist><button className="button button-danger w-full">Apply member action</button></StaffActionForm></section> : <div className="card p-4 text-sm muted">This account cannot be moderated because it is deleted or protected by the role hierarchy.</div>)}
          <section className="card p-4"><h2 className="font-black">Decision</h2><StaffActionForm action={closeCase} className="mt-3 space-y-2"><input type="hidden" name="caseId" value={reportCase.id} /><input className="input" name="reason" placeholder={closed ? "Reason for reopening" : "Resolution note"} aria-label={closed ? "Reason for reopening" : "Resolution note"} minLength={2} maxLength={500} required />{closed ? <button className="button button-secondary w-full" name="decision" value="REOPEN">Reopen case</button> : <div className="grid grid-cols-2 gap-2"><button className="button button-primary" name="decision" value="RESOLVED">Resolve</button><button className="button button-secondary" name="decision" value="DISMISSED">Dismiss</button></div>}</StaffActionForm></section>
        </aside>
      </div>
    </div>
  );
}
