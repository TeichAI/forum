import Link from "next/link";
import { CaseList } from "@/components/staff/case-list";
import { requireModerator } from "@/lib/auth";
import { db } from "@/lib/db";
import { decodeCursor, encodeCursor } from "@/lib/queries";

const PAGE_SIZE = 25;

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const viewer = await requireModerator();
  const params = await searchParams;
  const requestedPage = Number(params.page);
  const status = ["OPEN", "IN_REVIEW", "RESOLVED", "DISMISSED"].includes(params.status ?? "") ? params.status as "OPEN" | "IN_REVIEW" | "RESOLVED" | "DISMISSED" : undefined;
  const priority = ["LOW", "NORMAL", "HIGH", "URGENT"].includes(params.priority ?? "") ? params.priority as "LOW" | "NORMAL" | "HIGH" | "URGENT" : undefined;
  const q = params.q?.trim().slice(0, 80);
  const cursor = decodeCursor<{ priority: "LOW" | "NORMAL" | "HIGH" | "URGENT"; createdAt: string; id: string }>(params.cursor);
  const cursorTime = cursor && !Number.isNaN(Date.parse(cursor.createdAt)) ? new Date(cursor.createdAt) : null;
  const priorities = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
  const cursorPriorityIndex = cursor ? priorities.indexOf(cursor.priority) : -1;
  const cursorWhere = cursorTime && cursor?.id && cursorPriorityIndex >= 0 ? { OR: [
    { priority: cursor.priority, OR: [{ createdAt: { gt: cursorTime } }, { createdAt: cursorTime, id: { gt: cursor.id } }] },
    ...(cursorPriorityIndex > 0 ? [{ priority: { in: priorities.slice(0, cursorPriorityIndex) } }] : []),
  ] } : undefined;
  const where = {
    status: status ?? { in: ["OPEN" as const, "IN_REVIEW" as const] },
    priority,
    assignedToId: params.assignee === "me" ? viewer.id : params.assignee === "unassigned" ? null : undefined,
    reports: q ? { some: { OR: [{ reason: { contains: q, mode: "insensitive" as const } }, { details: { contains: q, mode: "insensitive" as const } }, { reporter: { username: { contains: q, mode: "insensitive" as const } } }] } } : undefined,
    AND: cursorWhere,
  };
  const count = await db.moderationCase.count({ where });
  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const normalizedPage = Number.isFinite(requestedPage) && requestedPage > 0 ? Math.floor(requestedPage) : 1;
  const page = params.cursor ? 1 : Math.min(normalizedPage, pages);
  const fetched = await db.moderationCase.findMany({
    where,
    include: { assignedTo: { select: { displayName: true } }, reports: { take: 1, orderBy: { createdAt: "asc" }, select: { reason: true, reporter: { select: { username: true } } } }, _count: { select: { reports: true } } },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }, { id: "asc" }], ...(params.cursor ? {} : { skip: (page - 1) * PAGE_SIZE }), take: PAGE_SIZE + 1,
  });
  const cases = fetched.slice(0, PAGE_SIZE); const last = cases.at(-1); const nextCursor = fetched.length > PAGE_SIZE && last ? encodeCursor({ priority: last.priority, createdAt: last.createdAt.toISOString(), id: last.id }) : null;
  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3"><div><div className="eyebrow">Queue</div><h2 className="mt-1 text-2xl font-black">Report cases <span className="pill ml-2">{count}</span></h2></div></div>
      <form className="card my-4 grid gap-3 p-4 sm:grid-cols-[minmax(180px,1fr)_150px_140px_150px_auto]" action="/staff/reports">
        <input className="input" name="q" defaultValue={q} placeholder="Search reports or reporters" aria-label="Search reports" />
        <select className="input" name="status" defaultValue={status ?? "active"} aria-label="Case status"><option value="active">Active</option><option value="OPEN">Open</option><option value="IN_REVIEW">In review</option><option value="RESOLVED">Resolved</option><option value="DISMISSED">Dismissed</option></select>
        <select className="input" name="priority" defaultValue={priority ?? ""} aria-label="Priority"><option value="">Any priority</option>{["LOW", "NORMAL", "HIGH", "URGENT"].map((value) => <option key={value}>{value}</option>)}</select>
        <select className="input" name="assignee" defaultValue={params.assignee ?? ""} aria-label="Assignee"><option value="">Any assignee</option><option value="me">Assigned to me</option><option value="unassigned">Unassigned</option></select>
        <button className="button button-secondary">Filter</button>
      </form>
      <CaseList cases={cases} />
      {nextCursor ? <nav className="mt-4 flex items-center justify-end" aria-label="Report pages"><Link className="button button-secondary" href={{ pathname: "/staff/reports", query: { ...params, page: undefined, cursor: nextCursor } }}>More cases</Link></nav> : pages > 1 && !params.cursor ? <nav className="mt-4 flex items-center justify-end gap-2" aria-label="Report pages"><Link className="button button-secondary" aria-disabled={page === 1} href={{ pathname: "/staff/reports", query: { ...params, page: Math.max(1, page - 1) } }}>Previous</Link><span className="text-sm muted">Page {page} of {pages}</span><Link className="button button-secondary" aria-disabled={page === pages} href={{ pathname: "/staff/reports", query: { ...params, page: Math.min(pages, page + 1) } }}>Next</Link></nav> : null}
    </section>
  );
}
