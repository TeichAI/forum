import { describe, expect, it } from "vitest";
import { canonicalUrl, cleanMarkdownExcerpt, privateMetadata, publicMetadata } from "./metadata";

describe("forum metadata helpers", () => {
  it("builds absolute canonical URLs and shared public social metadata", () => {
    expect(canonicalUrl("/c/general")).toBe("http://localhost:3000/c/general");
    expect(publicMetadata({ title: "General", description: "Talk", path: "/c/general" })).toEqual(expect.objectContaining({ title: "General", alternates: { canonical: "http://localhost:3000/c/general" }, openGraph: expect.objectContaining({ siteName: "Teich Forum", type: "website" }), twitter: expect.objectContaining({ card: "summary_large_image" }) }));
  });

  it("converts markdown into a plain, bounded excerpt", () => {
    expect(cleanMarkdownExcerpt("# Hello **pond**\n[read more](https://example.com) `now`", 80)).toBe("Hello pond read more now");
    expect(cleanMarkdownExcerpt("one two three", 8)).toBe("one two…");
  });

  it("marks private routes noindex and nofollow", () => {
    expect(privateMetadata("Settings")).toEqual({ title: "Settings", robots: { index: false, follow: false } });
  });
});
