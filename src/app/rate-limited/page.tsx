import Link from "next/link";
import { Clock3 } from "lucide-react";
import { RateLimitedPageControls } from "./rate-limited-page-controls";

export const metadata = { title: "Please slow down" };
export const dynamic = "force-dynamic";

export default async function RateLimitedPage({ searchParams }: { searchParams: Promise<{ retryAfter?: string; resetAt?: string }> }) {
  const values = await searchParams;
  const parsedResetAt = Date.parse(values.resetAt ?? "");
  const resetAt = Number.isFinite(parsedResetAt) ? new Date(parsedResetAt).toISOString() : new Date(0).toISOString();

  return (
    <main className="shell grid min-h-[65vh] place-items-center py-12">
      <section className="card max-w-lg p-7 text-center sm:p-10" aria-labelledby="rate-limit-heading">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl" style={{ background: "var(--brand-soft)", color: "var(--brand)" }}>
          <Clock3 aria-hidden="true" />
        </div>
        <h1 id="rate-limit-heading" className="mt-5 text-2xl font-black">A quick breather</h1>
        <p className="mt-2 leading-7 muted">You’ve made several requests in a short time. Nothing is wrong with your account; please wait a moment and continue.</p>
        <RateLimitedPageControls resetAt={resetAt} />
        <Link href="/" className="button button-ghost mt-3">Return home</Link>
      </section>
    </main>
  );
}
