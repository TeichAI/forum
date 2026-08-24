import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Calendar, MessageCircle, UserPlus } from "lucide-react";
import { format } from "date-fns";
import { startConversation, toggleFollow } from "@/actions/forum";
import { ReportForm } from "@/components/forum/report-form";
import { ThreadCard } from "@/components/forum/thread-card";
import { Avatar } from "@/components/ui/avatar";
import { UserRoleBadge } from "@/components/ui/user-role-badge";
import { getViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { listThreads } from "@/lib/queries";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> { const { id } = await params; const user = await db.user.findUnique({ where: { id } }); return { title: user?.displayName ?? "Member" }; }

export default async function MemberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const viewer = await getViewer();
  const member = await db.user.findUnique({ where: { id }, include: { _count: { select: { followers: true, following: true, threads: true, replies: true } }, followers: viewer ? { where: { followerId: viewer.id } } : false } });
  if (!member || member.status === "DELETED") notFound();
  const threads = await listThreads({ authorId: member.id, take: 10 }); const own = viewer?.id === member.id; const returnTo = `/members/${member.id}`;
  return <div className="shell max-w-4xl py-9"><section className="card p-6 sm:p-8"><div className="flex flex-wrap items-start gap-5"><Avatar src={member.imageUrl} name={member.displayName} className="!h-20 !w-20" /><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h1 className="text-3xl font-black">{member.displayName}</h1><UserRoleBadge role={member.role} /></div><div className="mt-1 font-semibold muted">@{member.username}</div>{member.bio && <p className="mt-4 max-w-2xl leading-7">{member.bio}</p>}<div className="mt-4 flex flex-wrap gap-4 text-sm muted"><span><strong style={{ color: "var(--foreground)" }}>{member._count.followers}</strong> followers</span><span><strong style={{ color: "var(--foreground)" }}>{member._count.following}</strong> following</span><span className="flex items-center gap-1"><Calendar size={15} /> Joined {format(member.createdAt, "MMMM yyyy")}</span></div></div>{viewer && (own ? <a href="/settings" className="button button-secondary">Edit profile</a> : <div className="flex gap-2"><form action={toggleFollow}><input type="hidden" name="userId" value={member.id} /><input type="hidden" name="returnTo" value={returnTo} /><button className={member.followers?.length ? "button button-secondary" : "button button-primary"}><UserPlus size={16} /> {member.followers?.length ? "Following" : "Follow"}</button></form><form action={startConversation}><input type="hidden" name="userId" value={member.id} /><button className="button button-secondary"><MessageCircle size={16} /> Message</button></form></div>)}</div>{viewer && !own && <div className="mt-5 flex justify-end"><ReportForm targetType="USER" targetId={member.id} returnTo={returnTo} /></div>}</section><div className="mb-4 mt-8"><div className="eyebrow">Activity</div><h2 className="mt-1 text-2xl font-black">Recent discussions</h2></div><div className="space-y-3">{threads.length ? threads.map((thread) => <ThreadCard key={thread.id} thread={thread} />) : <div className="card p-8 text-center muted">No public discussions yet.</div>}</div></div>;
}
