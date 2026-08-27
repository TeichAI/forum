import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Header } from "@/components/header";
import { NewThreadDialogProvider } from "@/components/new-thread-dialog";
import { SiteFooter } from "@/components/site-footer";
import { getSessionUser, getViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { isE2ETestMode } from "@/lib/e2e-auth";
import { uploadsEnabled } from "@/lib/upload-capability";
import { getClerkAccessMode } from "@/lib/access-mode";
import { applicationUrl } from "@/lib/env";
import { siteDescription, siteName, socialImagePath } from "@/lib/metadata";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: applicationUrl(),
  title: { default: siteName, template: `%s · ${siteName}` },
  description: siteDescription,
  applicationName: siteName,
  authors: [{ name: "Teich" }],
  creator: "Teich",
  robots: { index: true, follow: true },
  openGraph: { type: "website", locale: "en_US", siteName, title: siteName, description: siteDescription, url: "/", images: [{ url: socialImagePath, width: 1200, height: 630, alt: siteName }] },
  twitter: { card: "summary_large_image", title: siteName, description: siteDescription, images: [socialImagePath] },
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const accessMode = getClerkAccessMode();
  const sessionUser = await getSessionUser();
  const viewer = await getViewer(sessionUser);
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
  const accountViewer = sessionUser ? {
    id: sessionUser.id,
    displayName: sessionUser.displayName,
    username: sessionUser.username,
    imageUrl: sessionUser.imageUrl,
    role: sessionUser.role,
  } : null;
  const content = (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <a className="skip-link" href="#main-content">Skip to main content</a>
        <NewThreadDialogProvider
          isAuthenticated={Boolean(viewer)}
          viewerRole={viewer?.role ?? null}
          categories={categories}
          uploadsEnabled={Boolean(viewer) && uploadsEnabled()}
        >
          <Header viewer={headerViewer} accountViewer={accountViewer} accessMode={accessMode} />
          <main id="main-content" tabIndex={-1}>{children}</main>
          <SiteFooter />
        </NewThreadDialogProvider>
      </body>
    </html>
  );
  if (isE2ETestMode()) return content;
  return (
    <ClerkProvider dynamic signInUrl="/sign-in" signUpUrl="/sign-up" waitlistUrl="/waitlist" signInFallbackRedirectUrl="/" signUpFallbackRedirectUrl="/">
      {content}
    </ClerkProvider>
  );
}
