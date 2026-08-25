import { mergeTag, renameTag } from "@/actions/staff";
import { StaffActionForm } from "@/components/staff/action-form";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function StaffTagsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireAdmin();
  const { q: rawQ } = await searchParams;
  const q = rawQ?.trim().slice(0, 50);
  const tags = await db.tag.findMany({ where: q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { slug: { contains: slugifySafe(q) } }] } : undefined, include: { _count: { select: { threads: true, aliases: true } } }, orderBy: [{ threads: { _count: "desc" } }, { name: "asc" }], take: 100 });
  const allTags = await db.tag.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
  return <section><div className="eyebrow">Taxonomy</div><h2 className="mt-1 text-2xl font-black">Tags</h2><p className="mt-1 text-sm muted">Rename display labels without breaking URLs, or merge duplicates with an automatic redirect.</p><form className="card my-4 flex gap-3 p-4"><input className="input" name="q" defaultValue={q} placeholder="Search tags" aria-label="Search tags" /><button className="button button-secondary">Search</button></form><div className="space-y-3">{tags.map((tag) => <article className="card p-4" key={tag.id}><div className="flex flex-wrap items-center gap-2"><strong>#{tag.name}</strong><span className="pill">{tag._count.threads} threads</span><span className="pill">{tag._count.aliases} aliases</span><span className="font-mono text-xs muted">/tag/{tag.slug}</span></div><div className="mt-3 grid gap-3 lg:grid-cols-2"><StaffActionForm action={renameTag} className="grid grid-cols-[1fr_auto] gap-2"><input type="hidden" name="tagId" value={tag.id} /><input className="input" name="name" defaultValue={tag.name} aria-label={`Rename ${tag.name}`} required /><button className="button button-secondary">Rename</button></StaffActionForm><StaffActionForm action={mergeTag} className="grid grid-cols-[1fr_auto] gap-2"><input type="hidden" name="sourceId" value={tag.id} /><select className="input" name="destinationId" defaultValue="" aria-label={`Merge ${tag.name} into`} required><option value="" disabled>Merge into…</option>{allTags.filter((item) => item.id !== tag.id).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select><button className="button button-danger">Merge</button></StaffActionForm></div></article>)}{!tags.length && <div className="card p-10 text-center muted">No tags match.</div>}</div></section>;
}

function slugifySafe(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
