import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("card empty-state", className)}>
      {icon ? <div className="mb-1" style={{ color: "var(--brand)" }}>{icon}</div> : null}
      <h3>{title}</h3>
      {description ? <p>{description}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
