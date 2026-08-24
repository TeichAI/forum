import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 72);
}

export function threadSlug(title: string) {
  const suffix = crypto.randomUUID().slice(0, 8);
  return `${slugify(title) || "discussion"}-${suffix}`;
}

export function excerpt(markdown: string, length = 180) {
  const plain = markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`~\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > length ? `${plain.slice(0, length).trim()}…` : plain;
}

export function parseMentions(markdown: string) {
  return [...new Set(Array.from(markdown.matchAll(/(?:^|\s)@([a-zA-Z0-9_]{3,30})\b/g), (match) => match[1].toLowerCase()))];
}

export function safeReturnPath(path: FormDataEntryValue | null, fallback = "/") {
  return typeof path === "string" && path.startsWith("/") && !path.startsWith("//") ? path : fallback;
}
