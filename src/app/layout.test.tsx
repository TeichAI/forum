import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ mode: vi.fn(), viewer: vi.fn(), categories: vi.fn(), uploads: vi.fn() }));
vi.mock("@/lib/e2e-auth", () => ({ isE2ETestMode: mocks.mode }));
vi.mock("@/lib/auth", () => ({ getViewer: mocks.viewer }));
vi.mock("@/lib/db", () => ({ db: { category: { findMany: mocks.categories } } }));
vi.mock("@/lib/upload-capability", () => ({ uploadsEnabled: mocks.uploads }));
vi.mock("@/components/header", () => ({ Header: ({ viewer }: { viewer: unknown }) => <header data-viewer={JSON.stringify(viewer)}>Header</header> }));
vi.mock("@/components/new-thread-dialog", () => ({ NewThreadDialogProvider: ({ children, ...props }: { children: React.ReactNode }) => <div data-provider={JSON.stringify(props)}>{children}</div> }));
vi.mock("@clerk/nextjs", () => ({ ClerkProvider: ({ children }: { children: React.ReactNode }) => <div data-testid="clerk-provider">{children}</div> }));

import RootLayout, { metadata } from "./layout";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.viewer.mockResolvedValue(null);
  mocks.categories.mockResolvedValue([]);
  mocks.uploads.mockReturnValue(false);
});

it("publishes site metadata and wraps normal rendering with Clerk", async () => {
  mocks.mode.mockReturnValue(false);
  const result = await RootLayout({ children: <p>Page</p> });
  expect(result.props).toEqual(expect.objectContaining({ signInUrl: "/sign-in", signUpUrl: "/sign-up" }));
  expect(metadata.description).toMatch(/community space/);
});

it("loads serializable composer data for members and omits Clerk only in validated E2E mode", async () => {
  mocks.viewer.mockResolvedValue({ id: "user", displayName: "Owen", username: "owen", imageUrl: null, role: "MEMBER" });
  mocks.categories.mockResolvedValue([{ id: "category", name: "General" }]);
  mocks.uploads.mockReturnValue(true);
  mocks.mode.mockReturnValue(true);
  const result = await RootLayout({ children: <p>Page</p> });
  expect(result.type).toBe("html");
  expect(mocks.categories).toHaveBeenCalledWith({ orderBy: { position: "asc" }, select: { id: true, name: true } });
});
