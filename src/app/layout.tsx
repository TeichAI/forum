import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Header } from "@/components/header";
import { isE2ETestMode } from "@/lib/e2e-auth";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Teich Forum", template: "%s · Teich Forum" },
  description: "The community space for Teich—ask questions, share what you are building, and shape the project.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const content = (
    <html lang="en"><body><Header /><main>{children}</main><footer className="shell py-12 text-center text-sm muted">Built with the Teich community.</footer></body></html>
  );
  if (isE2ETestMode()) return content;
  return (
    <ClerkProvider signInUrl="/sign-in" signUpUrl="/sign-up" signInFallbackRedirectUrl="/" signUpFallbackRedirectUrl="/">
      {content}
    </ClerkProvider>
  );
}
