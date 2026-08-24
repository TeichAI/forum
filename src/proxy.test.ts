import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ clerk: vi.fn(), mode: vi.fn(), next: vi.fn(() => "next-response") }));
vi.mock("@clerk/nextjs/server", () => ({ clerkMiddleware: () => mocks.clerk }));
vi.mock("@/lib/e2e-auth", () => ({ isE2ETestMode: mocks.mode }));
vi.mock("next/server", () => ({ NextResponse: { next: mocks.next } }));

import proxy, { config } from "./proxy";

beforeEach(() => vi.clearAllMocks());

describe("request proxy", () => {
  it("bypasses Clerk only in guarded E2E mode", () => {
    mocks.mode.mockReturnValue(true);
    expect(proxy({} as never, {} as never)).toBe("next-response");
    expect(mocks.clerk).not.toHaveBeenCalled();
  });

  it("delegates normal requests to Clerk", () => {
    mocks.mode.mockReturnValue(false);
    mocks.clerk.mockReturnValue("clerk-response");
    expect(proxy({ request: true } as never, { event: true } as never)).toBe("clerk-response");
    expect(mocks.clerk).toHaveBeenCalled();
  });

  it("matches application and API routes", () => {
    expect(config.matcher).toHaveLength(2);
    expect(config.matcher[1]).toBe("/(api|trpc)(.*)");
  });
});
