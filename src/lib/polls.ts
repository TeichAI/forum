export const POLL_DURATION_OPTIONS = [
  { value: "1h", label: "1 hour", milliseconds: 60 * 60 * 1_000 },
  { value: "1d", label: "1 day", milliseconds: 24 * 60 * 60 * 1_000 },
  { value: "3d", label: "3 days", milliseconds: 3 * 24 * 60 * 60 * 1_000 },
  { value: "7d", label: "7 days", milliseconds: 7 * 24 * 60 * 60 * 1_000 },
  { value: "14d", label: "14 days", milliseconds: 14 * 24 * 60 * 60 * 1_000 },
  { value: "30d", label: "30 days", milliseconds: 30 * 24 * 60 * 60 * 1_000 },
] as const;

export type PollDuration = (typeof POLL_DURATION_OPTIONS)[number]["value"];

export type PollOptionSnapshot = {
  id: string;
  text: string;
  position: number;
  voteCount: number;
  percentage: number;
};

export type PollSnapshot = {
  id: string;
  question: string;
  expiresAt: string;
  status: "ACTIVE" | "CLOSED";
  totalVotes: number;
  selectedOptionId: string | null;
  options: PollOptionSnapshot[];
};

export function pollDurationMilliseconds(duration: PollDuration) {
  return POLL_DURATION_OPTIONS.find((option) => option.value === duration)!.milliseconds;
}

export function pollStatus(expiresAt: Date | string, now = new Date()): PollSnapshot["status"] {
  return new Date(expiresAt).getTime() > now.getTime() ? "ACTIVE" : "CLOSED";
}
