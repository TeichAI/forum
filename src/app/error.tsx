"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Route rendering failed", { digest: error.digest });
  }, [error.digest]);

  return <div className="shell grid min-h-[60vh] place-items-center py-12"><section className="card max-w-lg p-8 text-center" role="alert"><div className="eyebrow">Unexpected error</div><h1 className="mt-2 text-3xl font-black">This page hit a snag</h1><p className="mt-3 muted">Try loading it again. If the problem continues, return to the forum.</p><div className="mt-6 flex flex-wrap justify-center gap-2"><button className="button button-primary" onClick={reset}>Try again</button><Link className="button button-secondary" href="/">Return home</Link></div></section></div>;
}
