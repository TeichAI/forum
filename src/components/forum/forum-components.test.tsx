import { render, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import { describe, expect, it, vi } from "vitest";
import { CategoryList } from "./category-list";
import { ContentMenu } from "./content-menu";
import { ReportForm } from "./report-form";
import { ThreadCard } from "./thread-card";

vi.mock("@/components/markdown-editor", () => ({ MarkdownEditor: () => <textarea aria-label="Post body" /> }));
vi.mock("@/components/ui/editor-dialog", () => ({ EditorDialog: ({ title, children }: { title: string; children: React.ReactNode }) => <section aria-label={title}>{children}</section> }));
vi.mock("@/components/ui/submit-button", () => ({ SubmitButton: ({ children, pendingLabel, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { pendingLabel?: string }) => <button data-pending-label={pendingLabel} {...props}>{children}</button> }));
vi.mock("@/lib/moderation", () => ({ getModerationSettings: async () => ({ reportReasons: ["Spam", "Other"] }) }));

const category = {
  id: "category", name: "General", slug: "general", description: "Talk", color: "#123456", icon: "hash", position: 1,
  postingPolicy: "OPEN" as const, archivedAt: null, createdAt: new Date(), updatedAt: new Date(), _count: { threads: 7 },
};
const thread = {
  id: "thread", slug: "hello", title: "Pinned hello", body: "A **useful** body", status: "PUBLISHED", isPinned: true,
  isLocked: false, viewCount: 0, authorId: "author", categoryId: "category", createdAt: new Date(), updatedAt: new Date(), editedAt: null,
  bumpedAt: new Date(), deletedAt: null,
  author: { id: "author", username: "author", displayName: "Author", imageUrl: null, role: "ADMIN" },
  category: { ...category, postingPolicy: "ANNOUNCEMENTS" as const },
  tags: [{ threadId: "thread", tagId: "tag", tag: { id: "tag", name: "Testing", slug: "testing", createdAt: new Date() } }],
  _count: { replies: 2, upvotes: 3, dislikes: 2, bookmarks: 4 },
  poll: null,
};

describe("forum display components", () => {
  it("renders category links and optional counts accessibly", async () => {
    const { container, rerender } = render(<CategoryList categories={[category]} />);
    expect(screen.getByRole("link", { name: /General7/ })).toHaveAttribute("href", "/c/general");
    expect(await axe(container)).toHaveNoViolations();
    rerender(<CategoryList categories={[{ ...category, _count: undefined }]} />);
    expect(screen.queryByText("7")).not.toBeInTheDocument();

    rerender(<CategoryList categories={[{ ...category, postingPolicy: "ADMIN_ONLY" } as never]} />);
    expect(screen.getByLabelText("Admin only")).toHaveAttribute("title", "Only admins can start discussions or comment.");
  });

  it("renders an empty state and exposes creation only to administrators", () => {
    render(<CategoryList categories={[]} />);
    expect(screen.getByText("No spaces have been created yet.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add space" })).not.toBeInTheDocument();

  });

  it("renders complete thread navigation and activity", () => {
    render(<ThreadCard thread={thread as never} />);
    expect(screen.getByRole("heading", { name: "Pinned hello" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Pinned hello/ })).toHaveAttribute("href", "/t/hello");
    expect(screen.getByRole("link", { name: "#Testing" })).toHaveAttribute("href", "/tag/testing");
    expect(screen.getByRole("img", { name: "Administrator" })).toBeInTheDocument();
    expect(screen.getByLabelText("Announcements")).toHaveAttribute("title", "Only admins can start discussions; everyone can comment.");
    expect(screen.getByLabelText("3 upvotes")).toHaveTextContent("3");
    expect(screen.getByLabelText("2 dislikes")).toHaveTextContent("2");
  });

  it("labels active and closed polls in discussion lists", () => {
    const { rerender } = render(<ThreadCard thread={{ ...thread, poll: { expiresAt: new Date(Date.now() + 60_000) } } as never} />);
    expect(screen.getByText("Live poll")).toBeInTheDocument();
    rerender(<ThreadCard thread={{ ...thread, poll: { expiresAt: new Date(Date.now() - 60_000) } } as never} />);
    expect(screen.getByText("Poll closed")).toBeInTheDocument();
  });

  it("renders an accessible report form with its target context", async () => {
    const { container } = render(await ReportForm({ targetType: "THREAD", targetId: "thread", returnTo: "/t/hello" }));
    expect(screen.getByLabelText("Reason")).toHaveValue("Spam");
    expect(screen.getByLabelText("Details")).toHaveAttribute("maxlength", "1000");
    expect(container.querySelector('input[name="targetType"]')).toHaveValue("THREAD");
    expect(await axe(container)).toHaveNoViolations();
  });

  it.each(["thread", "reply"] as const)("configures edit and soft-delete forms for a %s", (type) => {
    render(<ContentMenu type={type} id="target" body="Existing body" title="Existing title" />);
    expect(screen.getByRole("region", { name: `Edit ${type}` })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: `Delete ${type}` })).toBeInTheDocument();
    expect(document.querySelector(`input[name="${type}Id"]`)).toHaveValue("target");
    if (type === "thread") expect(screen.getByDisplayValue("Existing title")).toBeInTheDocument();
  });
});
