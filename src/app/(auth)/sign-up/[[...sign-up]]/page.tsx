import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { safeRedirect } from "@/components/auth/auth-utils";

export const metadata: Metadata = { title: "Join" };

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ redirect_url?: string | string[] }> }) {
  const [{ userId }, params] = await Promise.all([auth(), searchParams]);
  if (userId) redirect(safeRedirect(params.redirect_url));

  return (
    <AuthShell eyebrow="Join the community" title="Create your account" description="A home for curious builders, thoughtful questions, and shared progress.">
      <SignUpForm redirectUrl={safeRedirect(params.redirect_url)} />
    </AuthShell>
  );
}
