import { describe, expect, it } from "vitest";
import { canComment, canStartDiscussion } from "./space-posting-permissions";

const policies = ["OPEN", "ANNOUNCEMENTS", "ADMIN_ONLY"] as const;

describe("space posting permissions", () => {
  it.each([
    ["MEMBER", "OPEN", true],
    ["MEMBER", "ANNOUNCEMENTS", false],
    ["MEMBER", "ADMIN_ONLY", false],
    ["MODERATOR", "OPEN", true],
    ["MODERATOR", "ANNOUNCEMENTS", false],
    ["MODERATOR", "ADMIN_ONLY", false],
    ["ADMIN", "OPEN", true],
    ["ADMIN", "ANNOUNCEMENTS", true],
    ["ADMIN", "ADMIN_ONLY", true],
  ] as const)("allows %s to start in %s: %s", (role, policy, allowed) => {
    expect(canStartDiscussion(role, policy)).toBe(allowed);
  });

  it.each([
    ["MEMBER", "OPEN", true],
    ["MEMBER", "ANNOUNCEMENTS", false],
    ["MEMBER", "ADMIN_ONLY", false],
    ["MODERATOR", "OPEN", true],
    ["MODERATOR", "ANNOUNCEMENTS", false],
    ["MODERATOR", "ADMIN_ONLY", false],
    ["ADMIN", "OPEN", true],
    ["ADMIN", "ANNOUNCEMENTS", true],
    ["ADMIN", "ADMIN_ONLY", true],
  ] as const)("allows %s to comment in %s: %s", (role, policy, allowed) => {
    expect(canComment(role, policy)).toBe(allowed);
  });

  it.each(policies)("denies unauthenticated viewers for %s", (policy) => {
    expect(canStartDiscussion(null, policy)).toBe(false);
    expect(canComment(undefined, policy)).toBe(false);
  });
});
