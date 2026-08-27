import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { InvitationForm } from "@/components/auth/invitation-form";
import { safeRedirect } from "@/components/auth/auth-utils";
import { getClerkAccessMode } from "@/lib/access-mode";
import { privateMetadata } from "@/lib/metadata";

export const metadata: Metadata = privateMetadata("Join");

type SignUpSearchParams = {
  redirect_url?: string | string[];
  sso_continuation?: string | string[];
  __clerk_ticket?: string | string[];
  __clerk_status?: string | string[];
};

export default async function SignUpPage({ searchParams }: { searchParams: Promise<SignUpSearchParams> }) {
  const [{ userId }, params] = await Promise.all([auth(), searchParams]);
  const redirectUrl = safeRedirect(params.redirect_url);
  if (userId) redirect(redirectUrl);
  const ticket = typeof params.__clerk_ticket === "string" ? params.__clerk_ticket : undefined;
  const status = typeof params.__clerk_status === "string" ? params.__clerk_status : undefined;

  if (ticket && status === "complete") {
    return <AuthShell eyebrow="Invitation accepted" title="Your invitation is ready" description="This invitation has already been completed."><p className="text-sm leading-6 muted">Sign in to continue to Teich Forum.</p><Link href="/sign-in" className="button button-primary mt-6 w-full !py-3">Sign in</Link></AuthShell>;
  }

  if (ticket && (!status || status === "sign_up" || status === "sign_in")) {
    return (
      <AuthShell eyebrow="You’re invited" title={status === "sign_in" ? "Welcome back" : "Accept your invitation"} description="Finish joining Teich Forum with the secure invitation sent to your email.">
        <InvitationForm ticket={ticket} accountStatus={status === "sign_in" ? "sign_in" : "sign_up"} redirectUrl={redirectUrl} />
      </AuthShell>
    );
  }

  if (ticket) {
    return <AuthShell eyebrow="Invitation unavailable" title="This invitation link is invalid" description="The invitation status in this link is not recognized."><p className="text-sm leading-6 muted">Ask the Teich team for a new invitation, or sign in if you already have an account.</p><Link href="/sign-in" className="button button-primary mt-6 w-full !py-3">Sign in</Link></AuthShell>;
  }

  const accessMode = getClerkAccessMode();
  if (accessMode === "waitlist") redirect("/waitlist");

  if (accessMode === "restricted") {
    return (
      <AuthShell eyebrow="Invitation only" title="An invitation is required" description="Teich Forum is currently open only to invited members.">
        <p className="text-sm leading-6 muted">Open the secure link in your invitation email to create your account. If you have already joined, sign in instead.</p>
        <Link href="/sign-in" className="button button-primary mt-6 w-full !py-3">Sign in</Link>
        <Link href="/" className="button button-secondary mt-3 w-full !py-3">Return home</Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell eyebrow="Join the community" title="Create your account" description="A home for curious builders, thoughtful questions, and shared progress.">
      <SignUpForm redirectUrl={redirectUrl} ssoContinuation={params.sso_continuation === "1"} />
    </AuthShell>
  );
}
