import { describe, expect, it } from "vitest";
import { clerkErrorMessage, safeRedirect } from "./auth-utils";

describe("safeRedirect", () => {
  it.each(["/", "/settings", "/t/welcome?reply=1#latest", "/search?q=pond%20life"])("keeps the local path %s", (path) => {
    expect(safeRedirect(path)).toBe(path);
  });

  it.each([
    undefined,
    "",
    "settings",
    "https://example.com",
    "http://example.com",
    "javascript:alert(1)",
    "//example.com",
    "/\\example.com",
    "/%5cexample.com",
    "/%255cexample.com",
    "/%2f%2fexample.com",
    "/%252f%252fexample.com",
    "/line\nbreak",
    "/%00hidden",
    "/malformed%zz",
    ["/settings", "/messages"],
  ])("rejects the unsafe redirect %j", (value) => {
    expect(safeRedirect(value)).toBe("/");
  });
});

describe("clerkErrorMessage", () => {
  it("prefers Clerk's user-facing message", () => {
    expect(clerkErrorMessage({ message: "Internal detail", longMessage: "Check your email and try again." })).toBe("Check your email and try again.");
  });

  it("uses a normal message when no long message exists", () => {
    expect(clerkErrorMessage({ message: "Try another code." })).toBe("Try another code.");
  });

  it.each([null, undefined, "failure", 42, {}, { message: 42 }, { longMessage: false }])("uses the fallback for %j", (error) => {
    expect(clerkErrorMessage(error, "Fallback")).toBe("Fallback");
  });
});
