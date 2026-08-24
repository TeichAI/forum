import { Crown } from "lucide-react";
import { cn } from "@/lib/utils";

type UserRole = "MEMBER" | "MODERATOR" | "ADMIN";

export function UserRoleBadge({ role, className }: { role: UserRole; className?: string }) {
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
