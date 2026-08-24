import Link from "next/link";

type AuthShellProps = {
  children: React.ReactNode;
  eyebrow: string;
  title: string;
  description: string;
};

export function AuthShell({ children, eyebrow, title, description }: AuthShellProps) {
  return (
    <div className="shell py-7 sm:py-12">
      <div className="mx-auto max-w-xl overflow-hidden rounded-[26px] border shadow-[var(--shadow)]" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
        <section className="flex min-h-[620px] items-center px-5 py-9 sm:px-12 sm:py-12 lg:px-16">
          <div className="mx-auto w-full max-w-md">
            <Link href="/" className="mb-9 inline-flex items-center font-black tracking-tight" aria-label="Teich Forum home">
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
