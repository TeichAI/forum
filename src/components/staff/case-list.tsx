import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import type { ReportPriority, ReportStatus, ReportTargetType } from "@prisma/client";

export type CaseListItem = {
  id: string;
  targetType: ReportTargetType;
  status: ReportStatus;
  priority: ReportPriority;
  createdAt: Date;
  assignedTo: { displayName: string } | null;
  reports: { reason: string; reporter: { username: string } }[];
  _count: { reports: number };
};

export function CaseList({ cases }: { cases: CaseListItem[] }) {
  if (!cases.length) return <div className="card p-10 text-center muted">No cases match these filters.</div>;
  return (
    <div className="card overflow-hidden">
      {cases.map((item) => (
        <Link key={item.id} href={`/staff/reports/${item.id}`} className="staff-row">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`pill priority-${item.priority.toLowerCase()}`}>{item.priority.toLowerCase()}</span>
              <strong>{item.targetType.toLowerCase()} report</strong>
              <span className="pill">{item._count.reports} {item._count.reports === 1 ? "report" : "reports"}</span>
            </div>
            <p className="mt-1 truncate text-sm muted">{item.reports[0]?.reason ?? "Reported content"} · @{item.reports[0]?.reporter.username ?? "member"}</p>
          </div>
          <div className="text-right text-xs muted">
            <div>{item.assignedTo?.displayName ?? "Unassigned"}</div>
            <time>{formatDistanceToNow(item.createdAt, { addSuffix: true })}</time>
          </div>
        </Link>
      ))}
    </div>
  );
}
