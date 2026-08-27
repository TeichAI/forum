import type { Metadata } from "next";
import { applicationUrl } from "@/lib/env";

export const siteName = "Teich Forum";
export const siteDescription = "The community space for Teich—ask questions, share what you are building, and shape the project.";
export const socialImagePath = "/opengraph-image";

export const noIndexMetadata = { robots: { index: false, follow: false } } satisfies Metadata;

export function canonicalUrl(path = "/") {
  return new URL(path, applicationUrl()).toString();
}

export function cleanMarkdownExcerpt(markdown: string, limit = 160) {
  const text = markdown
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/<[^>]*>/g, "")
    .replace(/^[\s>*#+-]+/gm, "")
    .replace(/[*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length <= limit ? text : `${text.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

export function publicMetadata({ title, description = siteDescription, path = "/" }: { title?: string; description?: string; path?: string }): Metadata {
  const url = canonicalUrl(path);
  return {
    ...(title ? { title } : {}), description, alternates: { canonical: url },
    openGraph: { type: "website", siteName, title: title ?? siteName, description, url, images: [{ url: canonicalUrl(socialImagePath), width: 1200, height: 630, alt: siteName }] },
    twitter: { card: "summary_large_image", title: title ?? siteName, description, images: [canonicalUrl(socialImagePath)] },
  };
}

export function privateMetadata(title: string): Metadata {
  return { title, ...noIndexMetadata };
}
