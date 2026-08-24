import { describe, expect, it } from "vitest";
import { authFormUrl, clerkErrorMessage, safeRedirect, ssoCallbackUrl } from "./auth-utils";

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

describe("auth SSO URLs", () => {
  it("builds form continuation URLs without an unnecessary root redirect", () => {
    expect(authFormUrl("sign-in", "/", true)).toBe("/sign-in?sso_continuation=1");
    expect(authFormUrl("sign-up", "/settings?tab=profile", true)).toBe("/sign-up?redirect_url=%2Fsettings%3Ftab%3Dprofile&sso_continuation=1");
  });

  it("sanitizes form and callback destinations", () => {
    expect(authFormUrl("sign-in", "//evil.example")).toBe("/sign-in");
    expect(ssoCallbackUrl("sign-up", "//evil.example")).toBe("/sso-callback?origin=sign-up&redirect_url=%2F");
    expect(ssoCallbackUrl("sign-in", "/messages?thread=1")).toBe("/sso-callback?origin=sign-in&redirect_url=%2Fmessages%3Fthread%3D1");
  });
});
