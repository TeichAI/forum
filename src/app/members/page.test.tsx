import { render, screen, within } from "@testing-library/react";
import { axe } from "jest-axe";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listMembers: vi.fn(),
  countMembers: vi.fn(),
  requireUser: vi.fn(),
}));

vi.mock("@/lib/queries", () => ({ listMembersPage: mocks.listMembers }));
vi.mock("@/lib/db", () => ({ db: { user: { count: mocks.countMembers } } }));
vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));

import MembersPage, { metadata } from "./page";

const now = new Date("2026-08-25T12:00:00Z");
const members = [
  {
    id: "ada",
    username: "ada_l",
    displayName: "Ada Lovelace",
    bio: "Building thoughtful tools for people.",
    imageUrl: null,
    role: "MEMBER" as const,
    createdAt: now,
    email: "PRIVATE_DIRECTORY_EMAIL_SENTINEL",
    clerkId: "PRIVATE_DIRECTORY_CLERK_SENTINEL",
    suspensionReason: "PRIVATE_DIRECTORY_MODERATION_SENTINEL",
    _count: { threads: 2, replies: 3 },
  },
  {
    id: "grace",
    username: "grace_h",
    displayName: "Grace Hopper",
    bio: "",
    imageUrl: null,
    role: "MODERATOR" as const,
    createdAt: now,
    _count: { threads: 1, replies: 0 },
  },
];
const administrator = {
  ...members[0],
  id: "admin",
  username: "forum_admin",
  displayName: "Forum Admin",
  role: "ADMIN" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ id: "viewer", status: "ACTIVE" });
  mocks.countMembers.mockResolvedValue(3);
  mocks.listMembers.mockImplementation((_query: string, _cursor: string | undefined, _take: number, role: string) => Promise.resolve({
    items: role === "ADMIN" ? [administrator] : role === "MODERATOR" ? [members[1]] : [members[0]],
    nextCursor: null,
  }));
});

describe("members directory", () => {
  it("keeps directory metadata out of search indexes", () => {
    expect(metadata).toEqual({ title: "Members", robots: { index: false, follow: false } });
  });

  it("redirects anonymous visitors before any member query", async () => {
    mocks.requireUser.mockImplementationOnce(() => { throw new Error("redirect:/sign-in"); });
    await expect(MembersPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("redirect:/sign-in");
    expect(mocks.listMembers).not.toHaveBeenCalled();
    expect(mocks.countMembers).not.toHaveBeenCalled();
  });

  it("renders searchable member cards with profile links and public activity", async () => {
    const { container } = render(await MembersPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("heading", { level: 1, name: "Meet the members" })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Search members" })).toBeInTheDocument();
    expect(screen.getByText("3 active members")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Administrators" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Moderators" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Members" })).toBeInTheDocument();
    expect(screen.getByLabelText("Administrator")).toBeInTheDocument();
    const adaProfile = screen.getByRole("link", { name: "View Ada Lovelace's profile" });
    expect(adaProfile).toHaveAttribute("href", "/members/ada");
    expect(within(adaProfile).getByText("5 public contributions")).toBeInTheDocument();
    expect(screen.getByText("This member has not added a bio yet.")).toBeInTheDocument();
    expect(screen.getByText("moderator")).toBeInTheDocument();
    expect(mocks.listMembers).toHaveBeenCalledWith("", undefined, 50, "ADMIN");
    expect(mocks.listMembers).toHaveBeenCalledWith("", undefined, 50, "MODERATOR");
    expect(mocks.listMembers).toHaveBeenCalledWith("", undefined, 24, "MEMBER");
    expect(mocks.countMembers).toHaveBeenCalledWith({ where: { status: "ACTIVE" } });
    expect(mocks.requireUser).toHaveBeenCalledOnce();
    expect(container).not.toHaveTextContent(/PRIVATE_DIRECTORY_(EMAIL|CLERK|MODERATION)_SENTINEL/);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("trims searches and preserves them when loading more members", async () => {
    mocks.listMembers.mockImplementation((_query: string, _cursor: string | undefined, _take: number, role: string) => Promise.resolve({
      items: role === "MEMBER" ? [members[0]] : [],
      nextCursor: role === "MEMBER" ? "next page" : null,
    }));
    render(await MembersPage({ searchParams: Promise.resolve({ q: "  ada  ", cursor: "current" }) }));

    expect(screen.getByRole("searchbox", { name: "Search members" })).toHaveValue("ada");
    expect(screen.getByText("1 match on this page")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Clear" })).toHaveAttribute("href", "/members");
    expect(screen.getByRole("link", { name: "More members" })).toHaveAttribute("href", "/members?q=ada&cursor=next+page");
    expect(mocks.listMembers).toHaveBeenCalledWith("ada", "current", 24, "MEMBER");
  });

  it("offers a clear path when a search has no results", async () => {
    mocks.listMembers.mockResolvedValue({ items: [], nextCursor: null });
    render(await MembersPage({ searchParams: Promise.resolve({ q: "missing" }) }));

    expect(screen.getByRole("heading", { name: "No members found" })).toBeInTheDocument();
    expect(screen.getByText("No active members match “missing”. Try another name or username.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Clear search" })).toHaveAttribute("href", "/members");
  });
});
