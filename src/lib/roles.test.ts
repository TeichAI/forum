import { describe, expect, it } from "vitest";
import { normalizeClerkRole } from "./roles";

describe("normalizeClerkRole", () => {
  it.each([
    ["member", "MEMBER"],
    ["moderator", "MODERATOR"],
    ["admin", "ADMIN"],
  ] as const)("maps %s to %s", (input, expected) => {
    expect(normalizeClerkRole(input)).toBe(expected);
  });

  it.each([undefined, null, "", "ADMIN", "owner", 1, {}, []])("fails closed for %j", (input) => {
    expect(normalizeClerkRole(input)).toBe("MEMBER");
  });
});
