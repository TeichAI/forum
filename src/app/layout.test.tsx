import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ mode: vi.fn() }));
vi.mock("@/lib/e2e-auth", () => ({ isE2ETestMode: mocks.mode }));
vi.mock("@/components/header", () => ({ Header: () => <header>Header</header> }));
vi.mock("@clerk/nextjs", () => ({ ClerkProvider: ({ children }: { children: React.ReactNode }) => <div data-testid="clerk-provider">{children}</div> }));

import RootLayout, { metadata } from "./layout";

beforeEach(() => vi.clearAllMocks());

it("publishes site metadata and wraps normal rendering with Clerk", () => {
  mocks.mode.mockReturnValue(false);
  const result = RootLayout({ children: <p>Page</p> });
  expect((result as React.ReactElement).props).toEqual(expect.objectContaining({ signInUrl: "/sign-in", signUpUrl: "/sign-up" }));
  expect(metadata.description).toMatch(/community space/);
});

it("omits Clerk only in validated E2E mode", () => {
  mocks.mode.mockReturnValue(true);
  const result = RootLayout({ children: <p>Page</p> });
  expect((result as React.ReactElement).type).toBe("html");
});
