export type ClerkAccessMode = "public" | "restricted" | "waitlist";

export function parseClerkAccessMode(value?: string): ClerkAccessMode {
  if (!value) return "public";
  if (value === "public" || value === "restricted" || value === "waitlist") return value;
  throw new Error(`NEXT_PUBLIC_CLERK_ACCESS_MODE must be public, restricted, or waitlist; received ${JSON.stringify(value)}.`);
}

export function getClerkAccessMode() {
  return parseClerkAccessMode(process.env.NEXT_PUBLIC_CLERK_ACCESS_MODE);
}
