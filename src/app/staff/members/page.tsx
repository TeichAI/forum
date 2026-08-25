import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { requireModerator } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function StaffMembersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const viewer = await requireModerator();
  const params = await searchParams;
  const q = params.q?.trim().slice(0, 80);
  const status = ["ACTIVE", "SUSPENDED", "DELETED"].includes(params.status ?? "") ? params.status as "ACTIVE" | "SUSPENDED" | "DELETED" : undefined;
  const role = ["MEMBER", "MODERATOR", "ADMIN"].includes(params.role ?? "") ? params.role as "MEMBER" | "MODERATOR" | "ADMIN" : undefined;
  const users = await db.user.findMany({
    where: { status, role, OR: q ? [{ username: { contains: q, mode: "insensitive" } }, { displayName: { contains: q, mode: "insensitive" } }, ...(viewer.role === "ADMIN" ? [{ email: { contains: q, mode: "insensitive" as const } }] : [])] : undefined },
    select: { id: true, username: true, displayName: true, imageUrl: true, role: true, status: true, suspendedUntil: true, createdAt: true, email: viewer.role === "ADMIN" },
    orderBy: { createdAt: "desc" }, take: 100,
  });
  return <section><div className="eyebrow">Directory</div><h2 className="mt-1 text-2xl font-black">Members <span className="pill ml-2">{users.length}</span></h2><form action="/staff/members" className="card my-4 grid gap-3 p-4 sm:grid-cols-[1fr_160px_150px_auto]"><input className="input" name="q" defaultValue={q} placeholder={viewer.role === "ADMIN" ? "Name, username, or email" : "Name or username"} aria-label="Search members" /><select className="input" name="status" defaultValue={status ?? ""} aria-label="Member status"><option value="">Any status</option>{["ACTIVE", "SUSPENDED", "DELETED"].map((value) => <option key={value}>{value}</option>)}</select><select className="input" name="role" defaultValue={role ?? ""} aria-label="Member role"><option value="">Any role</option>{["MEMBER", "MODERATOR", "ADMIN"].map((value) => <option key={value}>{value}</option>)}</select><button className="button button-secondary">Filter</button></form><div className="card overflow-hidden">{users.map((user) => <Link className="staff-row" key={user.id} href={`/staff/members/${user.id}`}><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><strong>{user.displayName}</strong><span className="pill">{user.role.toLowerCase()}</span><span className="pill">{user.status.toLowerCase()}</span></div><p className="mt-1 truncate text-xs muted">@{user.username}{"email" in user && user.email ? ` · ${user.email}` : ""}</p></div><div className="text-right text-xs muted">Joined {formatDistanceToNow(user.createdAt, { addSuffix: true })}{user.suspendedUntil && <div>Until {user.suspendedUntil.toLocaleDateString()}</div>}</div></Link>)}{!users.length && <div className="p-10 text-center muted">No members match these filters.</div>}</div></section>;
}
