import { format } from "date-fns";
import { requireModerator } from "@/lib/auth";
import { db } from "@/lib/db";

const MODERATOR_ACTIONS = ["HIDE", "RESTORE", "LOCK", "UNLOCK", "PIN", "UNPIN", "SUSPEND", "UNSUSPEND", "RESOLVE_REPORT", "DISMISS_REPORT", "REOPEN_REPORT", "CLAIM_REPORT", "UNCLAIM_REPORT", "SET_PRIORITY", "ADD_NOTE"] as const;

export default async function StaffAuditPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const viewer = await requireModerator();
  const params = await searchParams;
  const q = params.q?.trim().slice(0, 80);
  const actions = await db.moderationAction.findMany({
    where: { type: viewer.role === "ADMIN" ? undefined : { in: [...MODERATOR_ACTIONS] }, OR: q ? [{ reason: { contains: q, mode: "insensitive" } }, { moderator: { displayName: { contains: q, mode: "insensitive" } } }] : undefined },
    include: { moderator: { select: { displayName: true } } }, orderBy: { createdAt: "desc" }, take: 100,
  });
  return <section><div className="eyebrow">Append-only history</div><h2 className="mt-1 text-2xl font-black">Audit log</h2><form action="/staff/audit" className="card my-4 flex gap-3 p-4"><input className="input" name="q" defaultValue={q} placeholder="Search actor or reason" aria-label="Search audit log" /><button className="button button-secondary">Search</button></form><div className="card overflow-hidden">{actions.map((action) => <div className="staff-row" key={action.id}><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2 text-sm"><strong>{action.moderator.displayName}</strong><span className="pill lowercase">{action.type.replaceAll("_", " ")}</span><span className="muted">{action.targetType.toLowerCase()}</span></div><p className="mt-1 text-sm muted">{action.reason}</p><p className="mt-1 font-mono text-[11px] muted">{action.targetId}</p></div><time className="text-xs muted">{format(action.createdAt, "PPp")}</time></div>)}{!actions.length && <div className="p-10 text-center muted">No audit events match.</div>}</div></section>;
}
