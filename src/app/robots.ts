import type { MetadataRoute } from "next";
import { canonicalUrl } from "@/lib/metadata";

export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/bookmarks", "/mail", "/messages", "/moderation", "/notifications", "/search", "/settings", "/staff", "/sign-in", "/sign-up", "/sso-callback", "/suspended", "/waitlist"] }, sitemap: canonicalUrl("/sitemap.xml") };
}
