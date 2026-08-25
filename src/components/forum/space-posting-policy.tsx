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

  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[0.65rem] font-extrabold uppercase tracking-wide"
      style={{
        borderColor: "color-mix(in srgb, var(--brand) 25%, var(--line))",
        background: "var(--brand-soft)",
        color: "var(--brand-dark)",
      }}
      title={details.description}
    >
      {details.label}
    </span>
  );
}
