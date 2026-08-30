import type { MetadataRoute } from "next";
import { isDeveloperMode } from "@/lib/env";
import { canonicalUrl } from "@/lib/metadata";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  if (isDeveloperMode()) return { rules: { userAgent: "*", disallow: "/" } };
  return { rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/bookmarks", "/mail", "/messages", "/moderation", "/notifications", "/search", "/settings", "/staff", "/sign-in", "/sign-up", "/sso-callback", "/suspended", "/waitlist"] }, sitemap: canonicalUrl("/sitemap.xml") };
}
