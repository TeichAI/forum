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

const category = {
  id: "category", name: "General", slug: "general", description: "Talk", color: "#123456", icon: "hash", position: 1,
  createdAt: new Date(), updatedAt: new Date(), _count: { threads: 7 },
};
const thread = {
  id: "thread", slug: "hello", title: "Pinned hello", body: "A **useful** body", status: "PUBLISHED", isPinned: true,
  isLocked: false, viewCount: 0, authorId: "author", categoryId: "category", createdAt: new Date(), updatedAt: new Date(), editedAt: null,
  bumpedAt: new Date(), deletedAt: null,
  author: { id: "author", username: "author", displayName: "Author", imageUrl: null, role: "ADMIN" }, category,
  tags: [{ threadId: "thread", tagId: "tag", tag: { id: "tag", name: "Testing", slug: "testing", createdAt: new Date() } }],
  _count: { replies: 2, votes: 3, bookmarks: 4 },
};

describe("forum display components", () => {
  it("renders category links and optional counts accessibly", async () => {
    const { container, rerender } = render(<CategoryList categories={[category]} />);
    expect(screen.getByRole("link", { name: /General7/ })).toHaveAttribute("href", "/c/general");
    expect(await axe(container)).toHaveNoViolations();
    rerender(<CategoryList categories={[{ ...category, _count: undefined }]} />);
    expect(screen.queryByText("7")).not.toBeInTheDocument();
  });

  it("renders complete thread navigation and activity", () => {
    render(<ThreadCard thread={thread as never} />);
    expect(screen.getByRole("heading", { name: "Pinned hello" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Pinned hello/ })).toHaveAttribute("href", "/t/hello");
    expect(screen.getByRole("link", { name: "#Testing" })).toHaveAttribute("href", "/tag/testing");
    expect(screen.getByRole("img", { name: "Administrator" })).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("renders an accessible report form with its target context", async () => {
    const { container } = render(<ReportForm targetType="THREAD" targetId="thread" returnTo="/t/hello" />);
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
