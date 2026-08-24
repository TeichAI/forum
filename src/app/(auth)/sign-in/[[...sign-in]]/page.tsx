import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignInForm } from "@/components/auth/sign-in-form";
import { InvitationForm } from "@/components/auth/invitation-form";
import { safeRedirect } from "@/components/auth/auth-utils";
import { getClerkAccessMode } from "@/lib/access-mode";

export const metadata: Metadata = { title: "Sign in" };

type SignInSearchParams = {
  redirect_url?: string | string[];
  sso_continuation?: string | string[];
  __clerk_ticket?: string | string[];
  __clerk_status?: string | string[];
};

export default async function SignInPage({ searchParams }: { searchParams: Promise<SignInSearchParams> }) {
  const [{ userId }, params] = await Promise.all([auth(), searchParams]);
  const redirectUrl = safeRedirect(params.redirect_url);
  if (userId) redirect(redirectUrl);
  const ticket = typeof params.__clerk_ticket === "string" ? params.__clerk_ticket : undefined;
  const status = typeof params.__clerk_status === "string" ? params.__clerk_status : undefined;

  if (ticket && status === "complete") {
    return <AuthShell eyebrow="Invitation accepted" title="Your invitation is ready" description="This invitation has already been completed."><p className="text-sm leading-6 muted">Sign in to continue to Teich Forum.</p><Link href={redirectUrl === "/" ? "/sign-in" : `/sign-in?redirect_url=${encodeURIComponent(redirectUrl)}`} className="button button-primary mt-6 w-full !py-3">Continue to sign in</Link></AuthShell>;
  }

  if (ticket && status !== "complete" && (!status || status === "sign_in" || status === "sign_up")) {
    return (
      <AuthShell eyebrow="You’re invited" title={status === "sign_up" ? "Accept your invitation" : "Welcome back"} description="Finish joining Teich Forum with the secure invitation sent to your email.">
        <InvitationForm ticket={ticket} accountStatus={status === "sign_up" ? "sign_up" : "sign_in"} redirectUrl={redirectUrl} />
      </AuthShell>
    );
  }

  if (ticket) {
    return <AuthShell eyebrow="Invitation unavailable" title="This invitation link is invalid" description="The invitation status in this link is not recognized."><p className="text-sm leading-6 muted">Ask the Teich team for a new invitation, or continue to sign in if you already have an account.</p><Link href="/sign-in" className="button button-primary mt-6 w-full !py-3">Sign in</Link></AuthShell>;
  }

  return (
    <AuthShell eyebrow="Welcome back" title="Sign in to Teich" description="Pick up where you left off and rejoin the conversation.">
      <SignInForm redirectUrl={redirectUrl} ssoContinuation={params.sso_continuation === "1"} accessMode={getClerkAccessMode()} />
    </AuthShell>
  );
}
