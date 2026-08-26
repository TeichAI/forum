import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Calendar, Mail, UserPlus } from "lucide-react";
import { format } from "date-fns";
import { toggleFollow } from "@/actions/forum";
import { ReportForm } from "@/components/forum/report-form";
import { ThreadCard } from "@/components/forum/thread-card";
import { Avatar } from "@/components/ui/avatar";
import { UserRoleBadge } from "@/components/ui/user-role-badge";
import { RateLimitForm } from "@/components/ui/rate-limit-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { getViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { listThreadsPage } from "@/lib/queries";
import { unavailableMetadata } from "@/lib/access";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> { const { id } = await params; const user = await db.user.findFirst({ where: { id, status: "ACTIVE" }, select: { displayName: true } }); return user ? { title: user.displayName } : unavailableMetadata; }

export default async function MemberPage({ params, searchParams = Promise.resolve({}) }: { params: Promise<{ id: string }>; searchParams?: Promise<{ cursor?: string }> }) {
  const { id } = await params; const { cursor } = await searchParams; const viewer = await getViewer();
  const member = await db.user.findFirst({ where: { id, status: "ACTIVE" }, include: { _count: { select: { followers: { where: { follower: { status: "ACTIVE" } } }, following: { where: { following: { status: "ACTIVE" } } }, threads: { where: { status: "PUBLISHED", category: { archivedAt: null } } }, replies: { where: { status: "PUBLISHED", thread: { status: "PUBLISHED", category: { archivedAt: null }, author: { status: "ACTIVE" } } } } } }, followers: viewer ? { where: { followerId: viewer.id } } : false } });
  if (!member) notFound();
  const threadPage = await listThreadsPage({ authorId: member.id, take: 10, cursor }); const threads = threadPage.items; const own = viewer?.id === member.id; const returnTo = `/members/${member.id}`;
  return <div className="shell max-w-4xl py-9"><section className="card p-6 sm:p-8"><div className="flex flex-wrap items-start gap-5"><Avatar src={member.imageUrl} name={member.displayName} className="!h-20 !w-20" /><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h1 className="text-3xl font-black">{member.displayName}</h1><UserRoleBadge role={member.role} /></div><div className="mt-1 font-semibold muted">@{member.username}</div>{member.bio && <p className="mt-4 max-w-2xl leading-7">{member.bio}</p>}<div className="mt-4 flex flex-wrap gap-4 text-sm muted"><span><strong style={{ color: "var(--foreground)" }}>{member._count.followers}</strong> followers</span><span><strong style={{ color: "var(--foreground)" }}>{member._count.following}</strong> following</span><span className="flex items-center gap-1"><Calendar size={15} /> Joined {format(member.createdAt, "MMMM yyyy")}</span></div></div>{viewer && (own ? <a href="/settings" className="button button-secondary">Edit profile</a> : <div className="flex gap-2"><RateLimitForm action={toggleFollow}><input type="hidden" name="userId" value={member.id} /><input type="hidden" name="returnTo" value={returnTo} /><SubmitButton className={member.followers?.length ? "button button-secondary" : "button button-primary"} pendingLabel="Updating…"><UserPlus size={16} /> {member.followers?.length ? "Following" : "Follow"}</SubmitButton></RateLimitForm><Link href={`/mail/compose?to=${member.id}`} className="button button-secondary"><Mail size={16} /> Mail</Link></div>)}</div>{viewer && !own && <div className="mt-5 flex justify-end"><ReportForm targetType="USER" targetId={member.id} returnTo={returnTo} /></div>}</section><div className="mb-4 mt-8"><div className="eyebrow">Activity</div><h2 className="mt-1 text-2xl font-black">Recent discussions</h2></div><div className="space-y-3">{threads.length ? threads.map((thread) => <ThreadCard key={thread.id} thread={thread} />) : <div className="card p-8 text-center muted">No public discussions yet.</div>}</div>{threadPage.nextCursor && <div className="mt-4 text-center"><a className="button button-secondary" href={`/members/${member.id}?cursor=${encodeURIComponent(threadPage.nextCursor)}`}>More discussions</a></div>}</div>;
}
