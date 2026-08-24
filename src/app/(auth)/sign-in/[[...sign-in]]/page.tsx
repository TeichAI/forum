import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignInForm } from "@/components/auth/sign-in-form";
import { safeRedirect } from "@/components/auth/auth-utils";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ redirect_url?: string | string[] }> }) {
  const [{ userId }, params] = await Promise.all([auth(), searchParams]);
  if (userId) redirect(safeRedirect(params.redirect_url));

  return (
    <AuthShell eyebrow="Welcome back" title="Sign in to Teich" description="Pick up where you left off and rejoin the conversation.">
      <SignInForm redirectUrl={safeRedirect(params.redirect_url)} />
    </AuthShell>
  );
}
