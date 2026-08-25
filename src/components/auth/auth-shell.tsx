import Link from "next/link";

type AuthShellProps = {
  children: React.ReactNode;
  eyebrow: string;
  title: string;
  description: string;
};

export function AuthShell({ children, eyebrow, title, description }: AuthShellProps) {
  return (
    <div className="shell py-8 sm:py-12">
      <div className="mx-auto max-w-xl overflow-hidden rounded-[22px] border shadow-[var(--shadow)]" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
        <section className="px-6 py-8 sm:px-10 sm:py-10 lg:px-12">
          <Link href="/" className="mb-8 inline-flex items-center font-black tracking-tight" aria-label="Teich Forum home">
            <span>Teich <span style={{ color: "var(--brand)" }}>Forum</span></span>
          </Link>
          <div className="eyebrow mb-2">{eyebrow}</div>
          <h1 className="text-2xl font-black tracking-tight sm:text-[1.95rem]">{title}</h1>
          <p className="mt-2 text-sm leading-6 muted">{description}</p>
          <div className="mt-7">{children}</div>
        </section>
      </div>
      <p className="mx-auto mt-6 max-w-xl text-center text-xs leading-5 muted">Protected by community guidelines. Need help? Contact support.</p>
    </div>
  );
}
