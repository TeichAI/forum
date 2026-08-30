"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RateLimitCountdown, useRateLimitCooldown } from "@/components/rate-limit-countdown";

export function RateLimitedPageControls() {
  const router = useRouter();
  const [trigger] = useState({});
  const { coolingDown, onReady } = useRateLimitCooldown(trigger);
  return (
    <div className="mt-6 space-y-3">
      <RateLimitCountdown trigger={trigger} onReady={onReady} />
      <button className="button button-primary mx-auto" type="button" disabled={coolingDown} onClick={() => router.back()}>
        Try again
      </button>
    </div>
  );
}
