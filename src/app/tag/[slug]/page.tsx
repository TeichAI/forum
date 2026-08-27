import { notFound, redirect } from "next/navigation";
import { ThreadCard } from "@/components/forum/thread-card";
import { db } from "@/lib/db";
import { listThreadsPage } from "@/lib/queries";
import type { Metadata } from "next";
import { publicMetadata } from "@/lib/metadata";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const tag = await db.tag.findUnique({ where: { slug } });
  return tag ? publicMetadata({ title: `#${tag.name}`, description: `Discussions tagged with ${tag.name}.`, path: `/tag/${tag.slug}` }) : { title: "Content unavailable", robots: { index: false, follow: false } };
}

export default async function TagPage({ params, searchParams = Promise.resolve({}) }: { params: Promise<{ slug: string }>; searchParams?: Promise<{ cursor?: string }> }) {
  const { slug } = await params;
  const { cursor } = await searchParams;
  const tag = await db.tag.findUnique({ where: { slug } });
  if (!tag) {
    const alias = await db.tagAlias.findUnique({ where: { slug }, include: { tag: true } });
    if (alias) redirect(`/tag/${alias.tag.slug}`);
    notFound();
  }
  const threadPage = await listThreadsPage({ tagId: tag.id, cursor });
  return <div className="shell max-w-4xl py-9"><div className="eyebrow">Topic</div><h1 className="mt-1 text-3xl font-black">#{tag.name}</h1><p className="mt-2 muted">Discussions tagged with {tag.name}.</p><div className="mt-7 space-y-3">{threadPage.items.map((thread) => <ThreadCard key={thread.id} thread={thread} />)}</div>{threadPage.nextCursor && <div className="mt-4 text-center"><a className="button button-secondary" href={`/tag/${tag.slug}?cursor=${encodeURIComponent(threadPage.nextCursor)}`}>More discussions</a></div>}</div>;
}
