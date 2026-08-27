import { ShieldCheck } from "lucide-react";
import { StaffNav } from "@/components/staff/staff-nav";
import { requireModerator } from "@/lib/auth";
import { privateMetadata } from "@/lib/metadata";

export const dynamic = "force-dynamic";
export const metadata = privateMetadata("Staff console");

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireModerator();
  return (
    <div className="shell py-7 sm:py-9">
      <header className="mb-6">
        <div className="eyebrow flex items-center gap-2"><ShieldCheck size={14} aria-hidden /> Staff console</div>
        <h1 className="mt-1 text-3xl font-black tracking-tight">Community operations</h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-6 muted">Review reports, manage members and content, and keep the community safe — all in one place.</p>
      </header>
      <div className="staff-shell">
        <aside className="staff-sidebar card p-2"><StaffNav role={viewer.role} /></aside>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
