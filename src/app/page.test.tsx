import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Home from "./page";

const mocks = vi.hoisted(() => ({
  getViewer: vi.fn(),
  listThreads: vi.fn(),
  findCategories: vi.fn(),
  countUsers: vi.fn(),
  categoryList: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getViewer: mocks.getViewer }));
vi.mock("@/lib/queries", () => ({ listThreadsPage: mocks.listThreads }));
vi.mock("@/lib/db", () => ({
  db: {
    category: { findMany: mocks.findCategories },
    user: { count: mocks.countUsers },
  },
}));
vi.mock("@/components/forum/category-list", () => ({
  CategoryList: (props: unknown) => { mocks.categoryList(props); return <div data-testid="category-list" />; },
}));
vi.mock("@/components/forum/thread-card", () => ({
  ThreadCard: () => <article data-testid="thread-card" />,
}));
vi.mock("@/components/new-thread-trigger", () => ({
  NewThreadTrigger: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
}));

beforeEach(() => {
  mocks.getViewer.mockReset();
  mocks.listThreads.mockReset().mockResolvedValue({ items: [], nextCursor: null });
  mocks.findCategories.mockReset().mockResolvedValue([{ id: "category", name: "General" }]);
  mocks.countUsers.mockReset().mockResolvedValue(1_234);
  mocks.categoryList.mockReset();
});

describe("home page", () => {
  it("shows the promotional hero and member count to signed-out visitors", async () => {
    mocks.getViewer.mockResolvedValue(null);

    render(await Home({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("heading", { level: 1, name: /Ideas grow better/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Start a discussion/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "1,234 community members" })).toHaveAttribute("href", "/members");
    expect(screen.queryByText(/Welcome back/)).not.toBeInTheDocument();
    expect(mocks.countUsers).toHaveBeenCalledWith({ where: { status: "ACTIVE" } });
  });

  it("shows a compact personalized welcome to signed-in members", async () => {
    mocks.getViewer.mockResolvedValue({ displayName: "Owen Example", role: "MEMBER" });

    render(await Home({ searchParams: Promise.resolve({ sort: "new" }) }));

    expect(screen.getByRole("heading", { level: 1, name: "Welcome back, Owen Example" })).toBeInTheDocument();
    expect(screen.getByText("Catch up on the latest ideas and discussions.")).toBeInTheDocument();
    expect(screen.queryByText(/Ideas grow better/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Start a discussion/ })).not.toBeInTheDocument();
    expect(mocks.countUsers).not.toHaveBeenCalled();
    expect(mocks.listThreads).toHaveBeenCalledWith({ sort: "new", cursor: undefined });
    expect(mocks.categoryList).toHaveBeenCalledWith({ categories: expect.any(Array) });
  });

  it("links administrators to the dedicated space console", async () => {
    mocks.getViewer.mockResolvedValue({ displayName: "Pond Admin", role: "ADMIN" });
    render(await Home({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole("link", { name: "Manage spaces" })).toHaveAttribute("href", "/staff/spaces");
    expect(screen.queryByLabelText("Administrator")).not.toBeInTheDocument();
  });
});
