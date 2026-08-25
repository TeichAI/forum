"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { RateLimitCountdown } from "@/components/rate-limit-countdown";

export function RateLimitedPageControls({ resetAt }: { resetAt: string }) {
  const router = useRouter();
  const [ready, setReady] = useState(() => new Date(resetAt).getTime() <= Date.now());
  const onReady = useCallback(() => setReady(true), []);
  return (
    <div className="mt-6 space-y-3">
      <RateLimitCountdown resetAt={resetAt} onReady={onReady} />
      <button className="button button-primary mx-auto" type="button" disabled={!ready} onClick={() => router.back()}>
        Try again
      </button>
    </div>
  );
}
