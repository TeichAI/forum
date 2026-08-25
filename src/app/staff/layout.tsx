import { ShieldCheck } from "lucide-react";
import { StaffNav } from "@/components/staff/staff-nav";
import { requireModerator } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireModerator();
  return (
    <div className="shell py-7 sm:py-9">
      <header className="mb-6">
        <div className="eyebrow flex items-center gap-2"><ShieldCheck size={14} /> Staff console</div>
        <h1 className="mt-1 text-3xl font-black">Community operations</h1>
        <p className="mt-1 text-sm muted">Moderation, member safety, and forum administration in one place.</p>
      </header>
      <div className="staff-shell">
        <aside className="staff-sidebar card p-2"><StaffNav role={viewer.role} /></aside>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
