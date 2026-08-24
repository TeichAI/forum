import type { Metadata } from "next";
import Link from "next/link";
import { createThread } from "@/actions/forum";
import { MarkdownEditor } from "@/components/markdown-editor";
import { SubmitButton } from "@/components/ui/submit-button";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Start a discussion" };
export const dynamic = "force-dynamic";

export default async function NewThreadPage() {
  await requireUser();
  const categories = await db.category.findMany({ orderBy: { position: "asc" } });
  return <div className="shell max-w-3xl py-9"><Link href="/" className="text-sm font-semibold muted">← Back to discussions</Link><div className="mt-5"><div className="eyebrow">Share with the community</div><h1 className="mt-1 text-3xl font-black">Start a discussion</h1><p className="mt-2 muted">A specific title and a little context will help people give you a useful answer.</p></div><form action={createThread} className="card mt-7 space-y-6 p-5 sm:p-8"><div><label className="label" htmlFor="title">Title</label><input className="input" id="title" name="title" minLength={5} maxLength={160} placeholder="What would you like to discuss?" required /></div><div className="grid gap-5 sm:grid-cols-2"><div><label className="label" htmlFor="categoryId">Space</label><select className="input" id="categoryId" name="categoryId" required><option value="">Choose a space</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div><div><label className="label" htmlFor="tags">Tags <span className="font-normal muted">(up to 5)</span></label><input className="input" id="tags" name="tags" maxLength={180} placeholder="api, showcase, question" /></div></div><div><label className="label">Post</label><MarkdownEditor rows={10} placeholder="Add context, code, links, or images…" /></div><div className="flex justify-end"><SubmitButton pendingLabel="Publishing…">Publish discussion</SubmitButton></div></form></div>;
}
