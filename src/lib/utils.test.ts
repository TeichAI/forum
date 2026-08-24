import { describe, expect, it } from "vitest";
import { excerpt, parseMentions, safeReturnPath, slugify, threadSlug } from "./utils";

describe("forum utilities", () => {
  it("creates readable, URL-safe slugs", () => {
    expect(slugify("  Building with Tëich!  ")).toBe("building-with-teich");
    expect(threadSlug("A useful discussion")).toMatch(/^a-useful-discussion-[a-f0-9]{8}$/);
  });

  it("extracts unique normalized mentions", () => {
    expect(parseMentions("Hello @Owen_1 and @teich. Again @Owen_1")).toEqual(["owen_1", "teich"]);
    expect(parseMentions("email@example.com is not a mention")).toEqual([]);
  });

  it("turns Markdown into a compact excerpt", () => {
    expect(excerpt("## Hello\n\nThis is **useful** [context](https://example.com).", 80)).toBe("Hello This is useful context.");
  });

  it("rejects external return paths", () => {
    expect(safeReturnPath("/t/welcome")).toBe("/t/welcome");
    expect(safeReturnPath("//malicious.example", "/safe")).toBe("/safe");
    expect(safeReturnPath("https://malicious.example", "/safe")).toBe("/safe");
  });
});
