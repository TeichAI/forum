import Link from "next/link";
import { Hash } from "lucide-react";
import type { Category } from "@prisma/client";
import { CreateSpaceDialog } from "@/components/forum/create-space-dialog";

export function CategoryList({ categories, canCreateSpace = false }: { categories: (Category & { _count?: { threads: number } })[]; canCreateSpace?: boolean }) {
  return (
    <aside className="card p-3">
      <div className="flex items-center justify-between gap-2 px-3 pb-2 pt-1">
        <div className="text-xs font-extrabold uppercase tracking-widest muted">Spaces</div>
        {canCreateSpace && <CreateSpaceDialog />}
      </div>
      <nav className="space-y-1">
        {categories.map((category) => (
          <Link key={category.id} href={`/c/${category.slug}`} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition hover:bg-[var(--surface-soft)]">
            <span className="grid h-7 w-7 place-items-center rounded-lg" style={{ color: category.color, background: `color-mix(in srgb, ${category.color} 13%, transparent)` }}><Hash size={15} /></span>
            <span className="min-w-0 flex-1 truncate">{category.name}</span>
            {category._count && <span className="text-xs muted">{category._count.threads}</span>}
          </Link>
        ))}
      </nav>
      {!categories.length && <p className="px-3 py-4 text-sm muted">No spaces have been created yet.</p>}
    </aside>
  );
}
