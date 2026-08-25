import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  category: vi.fn(), tag: vi.fn(), tagAlias: vi.fn(), bookmarks: vi.fn(), conversations: vi.fn(),
  viewer: vi.fn(), requireUser: vi.fn(), listThreads: vi.fn(), searchThreads: vi.fn(), notFound: vi.fn(), mode: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db: {
  category: { findUnique: mocks.category },
  tag: { findUnique: mocks.tag }, tagAlias: { findUnique: mocks.tagAlias }, bookmark: { findMany: mocks.bookmarks }, conversation: { findMany: mocks.conversations },
} }));
vi.mock("@/lib/auth", () => ({ getViewer: mocks.viewer, requireUser: mocks.requireUser }));
vi.mock("@/lib/e2e-auth", () => ({ isE2ETestMode: mocks.mode }));
vi.mock("@/components/account/account-security", () => ({ AccountSecurity: () => <section>Custom identity settings</section> }));
vi.mock("@/lib/queries", () => ({
  canModerate: (viewer: { role?: string } | null) => viewer?.role === "MODERATOR" || viewer?.role === "ADMIN",
  listThreads: mocks.listThreads,
  searchThreads: mocks.searchThreads,
  threadListInclude: {},
}));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/components/forum/thread-card", () => ({ ThreadCard: ({ thread }: { thread: { title: string } }) => <article>{thread.title}</article> }));
vi.mock("@/components/new-thread-trigger", () => ({ NewThreadTrigger: ({ categoryId, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { categoryId?: string }) => <button data-category-id={categoryId} {...props}>{children}</button> }));

import BookmarksPage from "./bookmarks/page";
import CategoryPage, { generateMetadata as categoryMetadata } from "./c/[slug]/page";
import MessagesPage from "./messages/page";
import SearchPage from "./search/page";
import SettingsPage from "./settings/page";
import SuspendedPage from "./suspended/page";
import TagPage from "./tag/[slug]/page";
import NotFound from "./not-found";

const user = { id: "user", displayName: "Owen", username: "owen", bio: "Pond builder" };
const category = { id: "category", slug: "general", name: "General", description: "Community talk", color: "#123456", postingPolicy: "OPEN" };
const thread = { id: "thread", title: "A discussion" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue(user);
  mocks.viewer.mockResolvedValue(null);
  mocks.listThreads.mockResolvedValue([]);
  mocks.searchThreads.mockResolvedValue([]);
  mocks.notFound.mockImplementation(() => { throw new Error("NEXT_NOT_FOUND"); });
  mocks.tagAlias.mockResolvedValue(null);
  mocks.mode.mockReturnValue(true);
});

describe("category, tag, and search pages", () => {
  it("generates category metadata and renders populated and empty states", async () => {
    mocks.category.mockResolvedValue(category);
    await expect(categoryMetadata({ params: Promise.resolve({ slug: "general" }) })).resolves.toEqual({ title: "General", description: "Community talk" });
    mocks.listThreads.mockResolvedValue([thread]);
    const { rerender } = render(await CategoryPage({ params: Promise.resolve({ slug: "general" }) }));
    expect(screen.getByRole("heading", { name: "General" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New thread" })).toHaveAttribute("data-category-id", "category");
    expect(screen.getByText("A discussion")).toBeInTheDocument();
    mocks.listThreads.mockResolvedValue([]);
    rerender(await CategoryPage({ params: Promise.resolve({ slug: "general" }) }));
    expect(screen.getByText("No discussions here yet.")).toBeInTheDocument();
  });

  it("uses fallback category metadata and notFound for unknown categories", async () => {
    mocks.category.mockResolvedValue(null);
    await expect(categoryMetadata({ params: Promise.resolve({ slug: "missing" }) })).resolves.toEqual({ title: "Space", description: undefined });
    await expect(CategoryPage({ params: Promise.resolve({ slug: "missing" }) })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("labels restricted spaces and replaces the member trigger with policy guidance", async () => {
    mocks.viewer.mockResolvedValue({ ...user, role: "MODERATOR" });
    mocks.category.mockResolvedValue({ ...category, postingPolicy: "ANNOUNCEMENTS" });

    const { rerender } = render(await CategoryPage({ params: Promise.resolve({ slug: "general" }) }));
    expect(screen.getByLabelText("Announcements")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New thread" })).not.toBeInTheDocument();
    expect(screen.getByText(/Only admins can start discussions here/)).toBeInTheDocument();

    mocks.viewer.mockResolvedValue({ ...user, role: "ADMIN" });
    mocks.category.mockResolvedValue({ ...category, postingPolicy: "ADMIN_ONLY" });
    rerender(await CategoryPage({ params: Promise.resolve({ slug: "general" }) }));
    expect(screen.getByLabelText("Admin only")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New thread" })).toBeInTheDocument();
  });

  it("labels an archived space once for staff without exposing creation", async () => {
    mocks.viewer.mockResolvedValue({ ...user, role: "ADMIN" });
    mocks.category.mockResolvedValue({ ...category, archivedAt: new Date() });

    render(await CategoryPage({ params: Promise.resolve({ slug: "general" }) }));

    expect(screen.getAllByText("Archived")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "New thread" })).not.toBeInTheDocument();
  });

  it("renders a tag result and rejects missing tags", async () => {
    mocks.tag.mockResolvedValue({ id: "tag", name: "Testing", slug: "testing" });
    mocks.listThreads.mockResolvedValue([thread]);
    render(await TagPage({ params: Promise.resolve({ slug: "testing" }) }));
    expect(screen.getByRole("heading", { name: "#Testing" })).toBeInTheDocument();
    expect(mocks.listThreads).toHaveBeenCalledWith({ tagId: "tag" });
    mocks.tag.mockResolvedValue(null);
    await expect(TagPage({ params: Promise.resolve({ slug: "missing" }) })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("renders blank, singular, plural, and empty search results", async () => {
    const { rerender } = render(await SearchPage({ searchParams: Promise.resolve({}) }));
    expect(screen.queryByText(/result/)).not.toBeInTheDocument();
    mocks.searchThreads.mockResolvedValue([thread]);
    rerender(await SearchPage({ searchParams: Promise.resolve({ q: "pond" }) }));
    expect(screen.getByText(/1 result for/)).toBeInTheDocument();
    mocks.searchThreads.mockResolvedValue([]);
    rerender(await SearchPage({ searchParams: Promise.resolve({ q: "none" }) }));
    expect(screen.getByText(/0 results for/)).toBeInTheDocument();
    expect(screen.getByText("Nothing surfaced")).toBeInTheDocument();
  });
});

describe("protected utility pages", () => {
  it("renders populated and empty bookmarks", async () => {
    mocks.bookmarks.mockResolvedValue([{ thread }]);
    const { rerender } = render(await BookmarksPage());
    expect(screen.getByText("A discussion")).toBeInTheDocument();
    mocks.bookmarks.mockResolvedValue([]);
    rerender(await BookmarksPage());
    expect(screen.getByText("Nothing saved yet")).toBeInTheDocument();
  });

  it("renders conversations from either side with and without messages", async () => {
    const other = { id: "other", displayName: "Other", username: "other", imageUrl: null };
    mocks.conversations.mockResolvedValue([
      { id: "one", memberOneId: "user", memberTwoId: "other", memberOne: user, memberTwo: other, lastMessageAt: new Date(), messages: [{ body: "Latest message" }] },
      { id: "two", memberOneId: "other", memberTwoId: "user", memberOne: other, memberTwo: user, lastMessageAt: new Date(), messages: [] },
    ]);
    const { rerender } = render(await MessagesPage());
    expect(screen.getByText("Latest message")).toBeInTheDocument();
    expect(screen.getByText("Start the conversation")).toBeInTheDocument();
    mocks.conversations.mockResolvedValue([]);
    rerender(await MessagesPage());
    expect(screen.getByText("No conversations yet")).toBeInTheDocument();
  });

  it("renders profile settings defaults", async () => {
    render(await SettingsPage());
    expect(screen.getByRole("heading", { name: "Account settings" })).toBeInTheDocument();
    expect(screen.getByLabelText("Display name")).toHaveValue("Owen");
    expect(screen.getByLabelText("Username")).toHaveValue("owen");
    expect(screen.getByLabelText("Bio")).toHaveValue("Pond builder");
    expect(screen.queryByText("Custom identity settings")).not.toBeInTheDocument();

    mocks.mode.mockReturnValue(false);
    render(await SettingsPage());
    expect(screen.getByText("Custom identity settings")).toBeInTheDocument();
  });
});

it("renders standalone not-found and suspended guidance", () => {
  const { rerender } = render(<NotFound />);
  expect(screen.getByRole("link", { name: "Back to the forum" })).toHaveAttribute("href", "/");
  rerender(<SuspendedPage />);
  expect(screen.getByRole("heading", { name: /access is suspended/ })).toBeInTheDocument();
});
