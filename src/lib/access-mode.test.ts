import { describe, expect, it } from "vitest";
import { parseClerkAccessMode } from "./access-mode";

describe("Clerk access mode configuration", () => {
  it("defaults missing configuration to public", () => {
    expect(parseClerkAccessMode()).toBe("public");
    expect(parseClerkAccessMode("")).toBe("public");
  });

  it.each(["public", "restricted", "waitlist"] as const)("accepts %s", (mode) => {
    expect(parseClerkAccessMode(mode)).toBe(mode);
  });

  it("rejects unknown values", () => {
    expect(() => parseClerkAccessMode("private")).toThrow(/must be public, restricted, or waitlist/);
  });
});
