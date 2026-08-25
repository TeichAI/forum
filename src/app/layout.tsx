import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Header } from "@/components/header";
import { NewThreadDialogProvider } from "@/components/new-thread-dialog";
import { SiteFooter } from "@/components/site-footer";
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
  const categories = await db.category.findMany({
    where: { archivedAt: null },
    orderBy: { position: "asc" },
    select: { id: true, name: true, postingPolicy: true },
  });
  const headerViewer = viewer ? {
    id: viewer.id,
    displayName: viewer.displayName,
    username: viewer.username,
    imageUrl: viewer.imageUrl,
    role: viewer.role,
  } : null;
  const content = (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <NewThreadDialogProvider
          isAuthenticated={Boolean(viewer)}
          viewerRole={viewer?.role ?? null}
          categories={categories}
          uploadsEnabled={Boolean(viewer) && uploadsEnabled()}
        >
          <Header viewer={headerViewer} accessMode={accessMode} />
          <main>{children}</main>
          <SiteFooter />
        </NewThreadDialogProvider>
      </body>
    </html>
  );
  if (isE2ETestMode()) return content;
  return (
    <ClerkProvider signInUrl="/sign-in" signUpUrl="/sign-up" waitlistUrl="/waitlist" signInFallbackRedirectUrl="/" signUpFallbackRedirectUrl="/">
      {content}
    </ClerkProvider>
  );
}
