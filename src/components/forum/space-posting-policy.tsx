import { Lock, Megaphone } from "lucide-react";
import type { SpacePostingPolicy } from "@prisma/client";

export const SPACE_POSTING_POLICY_OPTIONS = [
  {
    value: "OPEN",
    label: "Open",
    description: "Everyone can start discussions and comment.",
  },
  {
    value: "ANNOUNCEMENTS",
    label: "Announcements",
    description: "Only admins can start discussions; everyone can comment.",
  },
  {
    value: "ADMIN_ONLY",
    label: "Admin only",
    description: "Only admins can start discussions or comment.",
  },
] as const satisfies ReadonlyArray<{
  value: SpacePostingPolicy;
  label: string;
  description: string;
}>;

const POLICY_DETAILS = Object.fromEntries(
  SPACE_POSTING_POLICY_OPTIONS.map((option) => [option.value, option]),
) as Record<SpacePostingPolicy, (typeof SPACE_POSTING_POLICY_OPTIONS)[number]>;

export function PostingPolicyBadge({ policy }: { policy: SpacePostingPolicy }) {
  if (policy === "OPEN") return null;
  const details = POLICY_DETAILS[policy];
  const Icon = policy === "ANNOUNCEMENTS" ? Megaphone : Lock;

  return (
    <span
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border"
      style={{
        borderColor: "color-mix(in srgb, var(--brand) 25%, var(--line))",
        background: "var(--brand-soft)",
        color: "var(--brand-dark)",
      }}
      title={details.description}
      aria-label={details.label}
      role="img"
    >
      <Icon size={12} aria-hidden="true" />
    </span>
  );
}
