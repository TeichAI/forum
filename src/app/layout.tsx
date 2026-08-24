import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Header } from "@/components/header";
import { NewThreadDialogProvider } from "@/components/new-thread-dialog";
import { getViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { isE2ETestMode } from "@/lib/e2e-auth";
import { uploadsEnabled } from "@/lib/upload-capability";
import { getClerkAccessMode } from "@/lib/access-mode";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Teich Forum", template: "%s · Teich Forum" },
  description: "The community space for Teich—ask questions, share what you are building, and shape the project.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const accessMode = getClerkAccessMode();
  const viewer = await getViewer();
  const categories = await db.category.findMany({ orderBy: { position: "asc" }, select: { id: true, name: true } });
  const headerViewer = viewer ? {
    id: viewer.id,
    displayName: viewer.displayName,
    username: viewer.username,
    imageUrl: viewer.imageUrl,
    role: viewer.role,
  } : null;
  const content = (
    <html lang="en"><body><NewThreadDialogProvider isAuthenticated={Boolean(viewer)} categories={categories} uploadsEnabled={Boolean(viewer) && uploadsEnabled()}><Header viewer={headerViewer} accessMode={accessMode} /><main>{children}</main><footer className="shell py-12 text-center text-sm muted">Built with the Teich community.</footer></NewThreadDialogProvider></body></html>
  );
  if (isE2ETestMode()) return content;
  return (
    <ClerkProvider signInUrl="/sign-in" signUpUrl="/sign-up" waitlistUrl="/waitlist" signInFallbackRedirectUrl="/" signUpFallbackRedirectUrl="/">
      {content}
    </ClerkProvider>
  );
}
