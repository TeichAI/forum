import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { requireModerator } from "@/lib/auth";
import { db } from "@/lib/db";

const MODERATOR_ACTIONS = ["HIDE", "RESTORE", "LOCK", "UNLOCK", "PIN", "UNPIN", "SUSPEND", "UNSUSPEND", "RESOLVE_REPORT", "DISMISS_REPORT", "REOPEN_REPORT", "CLAIM_REPORT", "UNCLAIM_REPORT", "SET_PRIORITY", "ADD_NOTE"] as const;

export default async function StaffOverviewPage() {
  const viewer = await requireModerator();
  const [open, mine, hidden, suspended, actions, spaces, tags] = await Promise.all([
    db.moderationCase.count({ where: { status: { in: ["OPEN", "IN_REVIEW"] } } }),
    db.moderationCase.count({ where: { assignedToId: viewer.id, status: "IN_REVIEW" } }),
    Promise.all([db.thread.count({ where: { status: "HIDDEN" } }), db.reply.count({ where: { status: "HIDDEN" } })]).then(([threads, replies]) => threads + replies),
    db.user.count({ where: { status: "SUSPENDED" } }),
    db.moderationAction.findMany({
      where: { type: viewer.role === "ADMIN" ? undefined : { in: [...MODERATOR_ACTIONS] } },
      include: { moderator: { select: { displayName: true } } }, orderBy: { createdAt: "desc" }, take: 8,
    }),
    viewer.role === "ADMIN" ? db.category.count({ where: { archivedAt: null } }) : Promise.resolve(null),
    viewer.role === "ADMIN" ? db.tag.count() : Promise.resolve(null),
  ]);
  const stats = [
    ["Active cases", open, "/staff/reports"], ["Assigned to you", mine, "/staff/reports?assignee=me"],
    ["Hidden content", hidden, "/staff/content?status=HIDDEN"], ["Suspended members", suspended, "/staff/members?status=SUSPENDED"],
    ...(viewer.role === "ADMIN" ? [["Active spaces", spaces, "/staff/spaces"], ["Tags", tags, "/staff/tags"]] : []),
  ] as [string, number, string][];
  return (
    <div className="space-y-6">
      <section>
        <div className="eyebrow">At a glance</div><h2 className="mt-1 text-2xl font-black">Staff workload</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {stats.map(([label, value, href]) => <Link className="card card-hover staff-stat" href={href} key={label}><span className="text-sm font-bold muted">{label}</span><div className="staff-stat-value">{value}</div></Link>)}
        </div>
      </section>
      <section>
        <div className="flex items-end justify-between"><div><div className="eyebrow">Audit</div><h2 className="mt-1 text-xl font-black">Recent activity</h2></div><Link className="text-sm font-bold" style={{ color: "var(--brand)" }} href="/staff/audit">View all</Link></div>
        <div className="card mt-3 overflow-hidden">
          {actions.map((action) => <div className="staff-row" key={action.id}><div className="min-w-0 flex-1 text-sm"><strong>{action.moderator.displayName}</strong> <span className="lowercase muted">{action.type.replaceAll("_", " ")}</span><p className="mt-1 truncate text-xs muted">{action.reason}</p></div><time className="text-xs muted">{formatDistanceToNow(action.createdAt, { addSuffix: true })}</time></div>)}
          {!actions.length && <div className="p-8 text-center muted">No staff activity yet.</div>}
        </div>
      </section>
    </div>
  );
}
