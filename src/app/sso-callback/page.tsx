import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { SsoCallback } from "@/components/auth/sso-callback";
import { safeRedirect, type AuthFormOrigin } from "@/components/auth/auth-utils";
import { privateMetadata } from "@/lib/metadata";

export const metadata: Metadata = privateMetadata("Finishing authentication");

export default async function SsoCallbackPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string | string[]; origin?: string | string[] }>;
}) {
  const params = await searchParams;
  const origin: AuthFormOrigin = params.origin === "sign-up" ? "sign-up" : "sign-in";

  return (
    <AuthShell eyebrow="Secure authentication" title="Connecting your account" description="Please wait while we finish signing you in with your social account.">
      <SsoCallback redirectUrl={safeRedirect(params.redirect_url)} origin={origin} />
    </AuthShell>
  );
}
