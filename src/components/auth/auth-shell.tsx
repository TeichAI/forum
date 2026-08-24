import Link from "next/link";
import { Droplets, MessageCircleMore, Sparkles, UsersRound } from "lucide-react";

type AuthShellProps = {
  children: React.ReactNode;
  eyebrow: string;
  title: string;
  description: string;
};

export function AuthShell({ children, eyebrow, title, description }: AuthShellProps) {
  return (
    <div className="shell py-7 sm:py-12">
      <div className="mx-auto grid max-w-5xl overflow-hidden rounded-[26px] border shadow-[var(--shadow)] lg:grid-cols-[0.9fr_1.1fr]" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
        <aside className="relative hidden min-h-[640px] overflow-hidden p-10 lg:flex lg:flex-col" style={{ background: "var(--auth-panel)", color: "white" }}>
          <div className="absolute -bottom-20 -left-20 h-72 w-72 rounded-full bg-white/[0.04]" />

          <Link href="/" className="relative flex items-center font-black tracking-tight" aria-label="Teich Forum home">
            <span className="text-lg">Teich Forum</span>
          </Link>

          <div className="relative my-auto py-12">
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15">
              <Droplets size={23} />
            </div>
            <p className="max-w-sm text-3xl font-black leading-tight tracking-tight">A thoughtful place for ideas to take root.</p>
            <p className="mt-4 max-w-sm text-sm leading-6 text-white/85">Join builders, ask better questions, and help shape what Teich becomes next.</p>

            <div className="mt-9 space-y-3 text-sm font-semibold text-white/95">
              <div className="flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-lg bg-white/10"><MessageCircleMore size={16} /></span>Start and join meaningful discussions</div>
              <div className="flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-lg bg-white/10"><UsersRound size={16} /></span>Meet people building alongside you</div>
              <div className="flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-lg bg-white/10"><Sparkles size={16} /></span>Share experiments, lessons, and ideas</div>
            </div>
          </div>

          <p className="relative text-xs text-white/75">One account. The whole Teich community.</p>
        </aside>

        <section className="flex min-h-[620px] items-center px-5 py-9 sm:px-12 sm:py-12 lg:px-16">
          <div className="mx-auto w-full max-w-md">
            <Link href="/" className="mb-9 inline-flex items-center font-black tracking-tight lg:hidden" aria-label="Teich Forum home">
              <span>Teich <span style={{ color: "var(--brand)" }}>Forum</span></span>
            </Link>
            <div className="eyebrow mb-2">{eyebrow}</div>
            <h1 className="text-3xl font-black tracking-tight sm:text-[2.1rem]">{title}</h1>
            <p className="mt-2 text-sm leading-6 muted">{description}</p>
            <div className="mt-8">{children}</div>
          </div>
        </section>
      </div>
    </div>
  );
}
