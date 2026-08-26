"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Application rendering failed", { digest: error.digest });
  }, [error.digest]);

  return <html lang="en"><body><main className="shell grid min-h-screen place-items-center py-12"><section className="card max-w-lg p-8 text-center" role="alert"><h1 className="text-3xl font-black">Teich Forum couldn’t load</h1><p className="mt-3 muted">Retry the page or return to the forum home.</p><div className="mt-6 flex justify-center gap-2"><button className="button button-primary" onClick={reset}>Try again</button><Link className="button button-secondary" href="/">Return home</Link></div></section></main></body></html>;
}
