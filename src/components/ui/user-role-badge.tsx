import { Crown } from "lucide-react";
import type { ForumRole } from "@/lib/roles";
import { cn } from "@/lib/utils";

export function UserRoleBadge({ role, className }: { role: ForumRole; className?: string }) {
  if (role === "ADMIN") {
    return (
      <span className={cn("admin-icon", className)} role="img" aria-label="Administrator" title="Administrator">
        <Crown size={13} strokeWidth={2.5} aria-hidden="true" />
      </span>
    );
  }

  if (role === "MODERATOR") return <span className={cn("pill", className)}>moderator</span>;

  return null;
}
