"use client";

import { useFormStatus } from "react-dom";
import { useRateLimitFormStatus } from "@/components/ui/rate-limit-form";

type SubmitButtonProps = Omit<React.ComponentProps<"button">, "type"> & {
  pendingLabel?: string;
};

export function SubmitButton({ children, pendingLabel = "Saving…", className = "button button-primary", disabled, ...props }: SubmitButtonProps) {
  const { pending } = useFormStatus();
  const { coolingDown } = useRateLimitFormStatus();
  return <button {...props} type="submit" className={className} disabled={disabled || pending || coolingDown}>{pending ? pendingLabel : children}</button>;
}
