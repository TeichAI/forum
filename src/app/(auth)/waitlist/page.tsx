import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { WaitlistForm } from "@/components/auth/waitlist-form";
import { getClerkAccessMode } from "@/lib/access-mode";
import { privateMetadata } from "@/lib/metadata";

export const metadata: Metadata = privateMetadata("Join the waitlist");

export default async function WaitlistPage() {
  const [{ userId }, accessMode] = await Promise.all([auth(), Promise.resolve(getClerkAccessMode())]);
  if (userId) redirect("/");
  if (accessMode !== "waitlist") redirect("/sign-up");

  return (
    <AuthShell eyebrow="Early access" title="Join the Teich waitlist" description="Tell us where to reach you. We’ll send a secure invitation when access becomes available.">
      <WaitlistForm />
    </AuthShell>
  );
}
