import { ArrowDown, ArrowUp } from "lucide-react";
import { changeSpaceState, saveSpace } from "@/actions/staff";
import { StaffActionForm } from "@/components/staff/action-form";
import { SPACE_POSTING_POLICY_OPTIONS } from "@/components/forum/space-posting-policy";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

function SpaceFields({ space }: { space?: { id: string; name: string; description: string; color: string; postingPolicy: string } }) {
  return <>
    {space && <input type="hidden" name="spaceId" value={space.id} />}
    <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
      <label className="label">Name<input className="input" name="name" defaultValue={space?.name} minLength={2} maxLength={60} required /></label>
      <label className="label">Color<input className="input h-[46px]" name="color" type="color" defaultValue={space?.color ?? "#ff4f00"} required /></label>
    </div>
    <label className="label">Description<textarea className="input" name="description" defaultValue={space?.description} rows={2} minLength={2} maxLength={280} required /></label>
    <label className="label">Posting permissions<select className="input" name="postingPolicy" defaultValue={space?.postingPolicy ?? "OPEN"}>{SPACE_POSTING_POLICY_OPTIONS.map((option) => <option value={option.value} key={option.value}>{option.label} — {option.description}</option>)}</select></label>
  </>;
}

export default async function StaffSpacesPage() {
  await requireAdmin();
  const spaces = await db.category.findMany({ orderBy: [{ position: "asc" }, { name: "asc" }], include: { _count: { select: { threads: true } } } });
  return <section><div className="eyebrow">Administration</div><h2 className="mt-1 text-2xl font-black">Spaces</h2><p className="mt-1 text-sm muted">Create, configure, order, archive, and restore community spaces. Archived discussions remain available to staff only.</p><details className="card my-5 p-5"><summary className="cursor-pointer font-black">Create a space</summary><StaffActionForm action={saveSpace} className="mt-4 space-y-3"><SpaceFields /><button className="button button-primary">Create space</button></StaffActionForm></details><div className="space-y-4">{spaces.map((space, index) => <article className="card p-5" key={space.id}><div className="mb-4 flex flex-wrap items-center gap-2"><span className="h-8 w-1.5 rounded-full" style={{ background: space.color }} /><h3 className="font-black">{space.name}</h3><span className="pill">{space._count.threads} threads</span>{space.archivedAt && <span className="pill">archived</span>}<div className="ml-auto flex gap-1"><StaffActionForm action={changeSpaceState} className="contents"><input type="hidden" name="spaceId" value={space.id} /><button className="button button-ghost !p-2" name="action" value="UP" disabled={index === 0} aria-label={`Move ${space.name} up`}><ArrowUp size={16} /></button><button className="button button-ghost !p-2" name="action" value="DOWN" disabled={index === spaces.length - 1} aria-label={`Move ${space.name} down`}><ArrowDown size={16} /></button></StaffActionForm></div></div><StaffActionForm action={saveSpace}><SpaceFields space={space} /><div className="flex flex-wrap justify-between gap-2"><button className="button button-primary">Save changes</button></div></StaffActionForm><StaffActionForm action={changeSpaceState} className="mt-3"><input type="hidden" name="spaceId" value={space.id} /><button className={space.archivedAt ? "button button-secondary" : "button button-danger"} name="action" value={space.archivedAt ? "RESTORE" : "ARCHIVE"}>{space.archivedAt ? "Restore space" : "Archive space"}</button></StaffActionForm></article>)}</div></section>;
}
