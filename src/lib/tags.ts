import "server-only";

import type { Prisma } from "@prisma/client";
import { slugify } from "@/lib/utils";

export function normalizeTagSlugs(values: string[]) {
  return [...new Set(values.map((value) => slugify(value.trim())).filter(Boolean))].slice(0, 5);
}

export async function resolveCanonicalTags(tx: Prisma.TransactionClient, requested: string[]) {
  const slugs = normalizeTagSlugs(requested);
  if (!slugs.length) return [];

  const aliases = await tx.tagAlias.findMany({ where: { slug: { in: slugs } }, select: { slug: true, tag: true } });
  const aliasMap = new Map(aliases.map((alias) => [alias.slug, alias.tag]));
  const directSlugs = slugs.filter((slug) => !aliasMap.has(slug));
  const direct = await tx.tag.findMany({ where: { slug: { in: directSlugs } } });
  const directMap = new Map(direct.map((tag) => [tag.slug, tag]));
  const result = [];

  for (const slug of slugs) {
    const found = aliasMap.get(slug) ?? directMap.get(slug);
    if (found) {
      result.push(found);
      continue;
    }
    const created = await tx.tag.create({ data: { slug, name: slug.replace(/-/g, " ") } });
    directMap.set(slug, created);
    result.push(created);
  }
  return [...new Map(result.map((tag) => [tag.id, tag])).values()];
}
