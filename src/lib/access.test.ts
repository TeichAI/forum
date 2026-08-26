import { describe, expect, it } from "vitest";
import {
  activeMemberWhere,
  canAccessStaffContent,
  canModerateAuthor,
  publicReplyWhere,
  publicThreadWhere,
  unavailableMetadata,
} from "./access";

describe("central access rules", () => {
  it("requires published content, an active author, and an active space", () => {
    expect(publicThreadWhere).toEqual({
      status: "PUBLISHED",
      category: { archivedAt: null },
      author: { status: "ACTIVE" },
    });
    expect(publicReplyWhere).toEqual({ status: "PUBLISHED", author: { status: "ACTIVE" }, thread: publicThreadWhere });
    expect(activeMemberWhere).toEqual({ status: "ACTIVE" });
  });

  it("never grants staff visibility to an inactive account", () => {
    expect(canAccessStaffContent(null)).toBe(false);
    expect(canAccessStaffContent({ role: "MEMBER", status: "ACTIVE" })).toBe(false);
    expect(canAccessStaffContent({ role: "ADMIN", status: "SUSPENDED" })).toBe(false);
    expect(canAccessStaffContent({ role: "MODERATOR", status: "DELETED" })).toBe(false);
    expect(canAccessStaffContent({ role: "MODERATOR", status: "ACTIVE" })).toBe(true);
  });

  it("enforces the moderation hierarchy", () => {
    expect(canModerateAuthor("MODERATOR", "MEMBER")).toBe(true);
    expect(canModerateAuthor("MODERATOR", "MODERATOR")).toBe(false);
    expect(canModerateAuthor("ADMIN", "MODERATOR")).toBe(true);
    expect(canModerateAuthor("ADMIN", "ADMIN")).toBe(false);
  });

  it("supplies generic noindex metadata", () => {
    expect(unavailableMetadata).toEqual(expect.objectContaining({ title: "Content unavailable", robots: { index: false, follow: false } }));
  });
});
