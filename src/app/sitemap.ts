import type { MetadataRoute } from "next";
import { activeMemberWhere, publicThreadWhere } from "@/lib/access";
import { db } from "@/lib/db";
import { canonicalUrl } from "@/lib/metadata";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [categories, tags, members, threads] = await Promise.all([
    db.category.findMany({ where: { archivedAt: null }, select: { slug: true, updatedAt: true } }),
    db.tag.findMany({ where: { threads: { some: { thread: publicThreadWhere } } }, select: { slug: true, createdAt: true } }),
    db.user.findMany({ where: activeMemberWhere, select: { id: true, updatedAt: true } }),
    db.thread.findMany({ where: publicThreadWhere, select: { slug: true, updatedAt: true } }),
  ]);
  return [{ url: canonicalUrl("/"), changeFrequency: "daily", priority: 1 }, { url: canonicalUrl("/terms"), changeFrequency: "yearly", priority: 0.3 }, { url: canonicalUrl("/privacy"), changeFrequency: "yearly", priority: 0.3 }, ...categories.map((x) => ({ url: canonicalUrl(`/c/${x.slug}`), lastModified: x.updatedAt, changeFrequency: "daily" as const, priority: 0.8 })), ...tags.map((x) => ({ url: canonicalUrl(`/tag/${x.slug}`), lastModified: x.createdAt, changeFrequency: "weekly" as const, priority: 0.6 })), ...members.map((x) => ({ url: canonicalUrl(`/members/${x.id}`), lastModified: x.updatedAt, changeFrequency: "weekly" as const, priority: 0.5 })), ...threads.map((x) => ({ url: canonicalUrl(`/t/${x.slug}`), lastModified: x.updatedAt, changeFrequency: "weekly" as const, priority: 0.7 }))];
}
