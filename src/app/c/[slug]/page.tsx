import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ThreadCard } from "@/components/forum/thread-card";
import { db } from "@/lib/db";
import { listThreads } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params; const category = await db.category.findUnique({ where: { slug } });
  return { title: category?.name ?? "Space", description: category?.description };
}

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params; const category = await db.category.findUnique({ where: { slug } }); if (!category) notFound();
  const threads = await listThreads({ categoryId: category.id });
  return <div className="shell max-w-4xl py-9"><div className="card flex items-start gap-5 p-6 sm:p-8"><span className="mt-1 h-12 w-2 rounded-full" style={{ background: category.color }} /><div><div className="eyebrow">Community space</div><h1 className="mt-1 text-3xl font-black">{category.name}</h1><p className="mt-2 muted">{category.description}</p></div><Link href="/new" className="button button-primary ml-auto">New thread</Link></div><div className="mt-6 space-y-3">{threads.length ? threads.map((thread) => <ThreadCard key={thread.id} thread={thread} />) : <div className="card p-10 text-center muted">No discussions here yet.</div>}</div></div>;
}
