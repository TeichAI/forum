"use client";

import { useFormStatus } from "react-dom";
import { useRateLimitFormStatus } from "@/components/ui/rate-limit-form";

export function SubmitButton({ children, pendingLabel = "Saving…", className = "button button-primary" }: { children: React.ReactNode; pendingLabel?: string; className?: string }) {
  const { pending } = useFormStatus();
  const { coolingDown } = useRateLimitFormStatus();
  return <button type="submit" className={className} disabled={pending || coolingDown}>{pending ? pendingLabel : children}</button>;
}
