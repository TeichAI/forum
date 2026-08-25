import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { addStaffNote, setMemberSuspension } from "@/actions/staff";
import { StaffActionForm } from "@/components/staff/action-form";
import { requireModerator } from "@/lib/auth";
import { db } from "@/lib/db";
import { canModerateRole, getModerationSettings } from "@/lib/moderation";

export default async function StaffMemberPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireModerator();
  const { id } = await params;
  const [member, settings] = await Promise.all([
    db.user.findUnique({ where: { id }, include: {
      _count: { select: { threads: true, replies: true, reports: true } },
      receivedStaffNotes: { include: { author: { select: { displayName: true } } }, orderBy: { createdAt: "desc" } },
      moderationReceived: { include: { moderator: { select: { displayName: true } } }, orderBy: { createdAt: "desc" }, take: 30 },
    } }), getModerationSettings(),
  ]);
  if (!member) notFound();
  const actionable = member.status !== "DELETED" && canModerateRole(viewer.role, member.role);
  const unavailableMessage = member.status === "DELETED"
    ? "This account was deleted and cannot be moderated or reactivated."
    : "This staff account is protected by the role hierarchy. Manage staff access in Clerk.";
  return <div className="space-y-5"><div><Link href="/staff/members" className="text-sm font-bold muted">← Member directory</Link><div className="mt-3 flex flex-wrap items-center gap-2"><h2 className="text-2xl font-black">{member.displayName}</h2><span className="pill">{member.role.toLowerCase()}</span><span className="pill">{member.status.toLowerCase()}</span></div><p className="mt-1 text-sm muted">@{member.username}{viewer.role === "ADMIN" && member.email ? ` · ${member.email}` : ""}</p></div><div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]"><div className="space-y-5"><section className="card p-5"><h3 className="font-black">Forum activity</h3><div className="mt-4 grid grid-cols-3 gap-3 text-center"><div><strong className="text-2xl">{member._count.threads}</strong><p className="text-xs muted">threads</p></div><div><strong className="text-2xl">{member._count.replies}</strong><p className="text-xs muted">replies</p></div><div><strong className="text-2xl">{member._count.reports}</strong><p className="text-xs muted">reports filed</p></div></div><p className="mt-4 text-sm leading-6 muted">{member.bio || "No profile bio."}</p></section><section className="card p-5"><h3 className="font-black">Private staff notes</h3><div className="my-3 space-y-3">{member.receivedStaffNotes.map((note) => <div key={note.id} className="rounded-xl p-3 text-sm" style={{ background: "var(--surface-soft)" }}><p>{note.body}</p><p className="mt-2 text-xs muted">{note.author.displayName} · {format(note.createdAt, "PPp")}</p></div>)}{!member.receivedStaffNotes.length && <p className="text-sm muted">No staff notes.</p>}</div>{actionable && <StaffActionForm action={addStaffNote}><input type="hidden" name="userId" value={member.id} /><textarea className="input" name="body" rows={3} placeholder="Add durable moderation context…" aria-label="Private staff note" required /><button className="button button-secondary">Add private note</button></StaffActionForm>}</section><section className="card p-5"><h3 className="font-black">Moderation history</h3><div className="mt-3">{member.moderationReceived.map((action) => <div className="border-b py-3 text-sm last:border-0" style={{ borderColor: "var(--line)" }} key={action.id}><strong className="lowercase">{action.type.replaceAll("_", " ")}</strong><span className="muted"> by {action.moderator.displayName}</span><p className="mt-1 text-xs muted">{action.reason} · {format(action.createdAt, "PPp")}</p></div>)}{!member.moderationReceived.length && <p className="text-sm muted">No moderation history.</p>}</div></section></div><aside>{actionable ? <section className="card p-4"><h3 className="font-black">Account moderation</h3><p className="mt-1 text-xs muted">Roles remain managed in Clerk. Forum suspensions are reversible and audited.</p><StaffActionForm action={setMemberSuspension} className="mt-4 space-y-2"><input type="hidden" name="userId" value={member.id} /><input type="hidden" name="action" value={member.status === "SUSPENDED" ? "UNSUSPEND" : "SUSPEND"} />{member.status !== "SUSPENDED" && <select className="input" name="days" defaultValue="7" aria-label="Suspension duration">{settings.suspensionDurationsDays.map((days) => <option value={days} key={days}>{days} days</option>)}</select>}<input className="input" name="reason" list="member-reasons" placeholder="Reason" aria-label="Account moderation reason" required /><datalist id="member-reasons">{settings.actionReasons.map((reason) => <option value={reason} key={reason} />)}</datalist><button className="button button-danger w-full">{member.status === "SUSPENDED" ? "Unsuspend member" : "Suspend member"}</button></StaffActionForm></section> : <div className="card p-4 text-sm muted">{unavailableMessage}</div>}</aside></div></div>;
}
