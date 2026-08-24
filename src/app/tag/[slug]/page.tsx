import { notFound } from "next/navigation";
import { ThreadCard } from "@/components/forum/thread-card";
import { db } from "@/lib/db";
import { listThreads } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function TagPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params; const tag = await db.tag.findUnique({ where: { slug } }); if (!tag) notFound();
  const threads = await listThreads({ tagId: tag.id });
  return <div className="shell max-w-4xl py-9"><div className="eyebrow">Topic</div><h1 className="mt-1 text-3xl font-black">#{tag.name}</h1><p className="mt-2 muted">Discussions tagged with {tag.name}.</p><div className="mt-7 space-y-3">{threads.map((thread) => <ThreadCard key={thread.id} thread={thread} />)}</div></div>;
}
