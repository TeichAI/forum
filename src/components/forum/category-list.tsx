import Link from "next/link";
import { Hash } from "lucide-react";
import type { Category } from "@prisma/client";
import { CreateSpaceDialog } from "@/components/forum/create-space-dialog";
import { PostingPolicyBadge } from "@/components/forum/space-posting-policy";

export function CategoryList({ categories, canCreateSpace = false }: { categories: (Category & { _count?: { threads: number } })[]; canCreateSpace?: boolean }) {
  return (
    <aside className="card overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3" style={{ borderColor: "var(--line)" }}>
        <div>
          <div className="text-xs font-extrabold uppercase tracking-widest" style={{ color: "var(--foreground)" }}>Spaces</div>
          <div className="text-xs muted">Browse by topic</div>
        </div>
        {canCreateSpace && <CreateSpaceDialog />}
      </div>
      <nav className="p-2">
        {categories.length ? (
          <ul className="space-y-1" aria-label="Spaces">
            {categories.map((category) => (
              <li key={category.id}>
                <Link
                  href={`/c/${category.slug}`}
                  className="group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition hover:bg-[var(--surface-soft)] focus-visible:bg-[var(--surface-soft)]"
                >
                  <span
                    className="grid h-8 w-8 place-items-center rounded-lg border text-sm transition group-hover:scale-[1.02]"
                    style={{ color: category.color, background: `color-mix(in srgb, ${category.color} 14%, transparent)`, borderColor: `color-mix(in srgb, ${category.color} 18%, transparent)` }}
                    aria-hidden
                  >
                    <Hash size={15} />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{category.name}</span>
                  <PostingPolicyBadge policy={category.postingPolicy} />
                  {typeof category._count?.threads === "number" && (
                    <span className="rounded-full bg-[var(--surface-soft)] px-2 py-0.5 text-xs font-bold muted">{category._count.threads}</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-3 py-6 text-center text-sm leading-6 muted">No spaces have been created yet.</p>
        )}
      </nav>
    </aside>
  );
}
