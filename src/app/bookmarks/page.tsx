import { Bookmark } from "lucide-react";
import { ThreadCard } from "@/components/forum/thread-card";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { threadListInclude } from "@/lib/queries";

export const dynamic = "force-dynamic";
export default async function BookmarksPage() { const user = await requireUser(); const bookmarks = await db.bookmark.findMany({ where: { userId: user.id, thread: { status: "PUBLISHED" } }, include: { thread: { include: threadListInclude } }, orderBy: { createdAt: "desc" } }); return <div className="shell max-w-4xl py-9"><div className="eyebrow flex items-center gap-2"><Bookmark size={14} /> Your library</div><h1 className="mt-1 text-3xl font-black">Saved discussions</h1><div className="mt-7 space-y-3">{bookmarks.length ? bookmarks.map(({ thread }) => <ThreadCard key={thread.id} thread={thread} />) : <div className="card p-10 text-center"><h2 className="font-bold">Nothing saved yet</h2><p className="mt-1 muted">Bookmark useful discussions to find them here.</p></div>}</div></div>; }
