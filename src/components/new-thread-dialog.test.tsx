import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NewThreadDialogProvider } from "./new-thread-dialog";
import { NewThreadTrigger } from "./new-thread-trigger";

const navigation = vi.hoisted(() => ({ pathname: "/c/general", push: vi.fn() }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: navigation.push }),
}));
vi.mock("@/actions/forum", () => ({ createThread: vi.fn() }));

beforeEach(() => {
  navigation.pathname = "/c/general";
  navigation.push.mockReset();
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value: vi.fn(function showModal(this: HTMLDialogElement) {
        this.setAttribute("open", "");
      }),
    },
    close: {
      configurable: true,
      value: vi.fn(function close(this: HTMLDialogElement) {
        this.removeAttribute("open");
        this.dispatchEvent(new Event("close", { bubbles: true }));
      }),
    },
  });
});

afterEach(() => {
  const prototype = HTMLDialogElement.prototype as unknown as { showModal?: () => void; close?: () => void };
  delete prototype.showModal;
  delete prototype.close;
});

type PostingPolicy = "OPEN" | "ANNOUNCEMENTS" | "ADMIN_ONLY";
type ViewerRole = "MEMBER" | "MODERATOR" | "ADMIN";

function Composer({
  isAuthenticated = true,
  viewerRole = "MEMBER",
  categories = [
    { id: "general", name: "General", postingPolicy: "OPEN" },
    { id: "help", name: "Help", postingPolicy: "OPEN" },
  ],
}: {
  isAuthenticated?: boolean;
  viewerRole?: ViewerRole;
  categories?: { id: string; name: string; postingPolicy: PostingPolicy }[];
}) {
  return (
    <NewThreadDialogProvider
      isAuthenticated={isAuthenticated}
      viewerRole={isAuthenticated ? viewerRole : null}
      categories={categories}
      uploadsEnabled={false}
    >
      <NewThreadTrigger className="header-trigger">Header new thread</NewThreadTrigger>
      <NewThreadTrigger categoryId="help">Category new thread</NewThreadTrigger>
    </NewThreadDialogProvider>
  );
}

describe("NewThreadDialogProvider", () => {
  it("opens accessibly with category preselection and focuses the title", async () => {
    const user = userEvent.setup();
    const { container } = render(<Composer />);

    await user.click(screen.getByRole("button", { name: "Category new thread" }));

    const dialog = screen.getByRole("dialog", { name: "Start a discussion" });
    expect(dialog).toHaveAttribute("open");
    expect(screen.getByLabelText("Space")).toHaveValue("help");
    expect(screen.getByLabelText("Title")).toHaveFocus();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("closes with the X, restores focus, and clears every draft field", async () => {
    const user = userEvent.setup();
    render(<Composer />);
    const trigger = screen.getByRole("button", { name: "Category new thread" });
    await user.click(trigger);
    await user.type(screen.getByLabelText("Title"), "A drafted title");
    await user.type(screen.getByLabelText(/Tags/), "draft");
    await user.type(screen.getByLabelText("Post"), "Draft body");

    await user.click(screen.getByRole("button", { name: "Close new thread dialog" }));

    expect(screen.getByRole("dialog", { hidden: true })).not.toHaveAttribute("open");
    expect(trigger).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Header new thread" }));
    expect(screen.getByLabelText("Title")).toHaveValue("");
    expect(screen.getByLabelText("Space")).toHaveValue("");
    expect(screen.getByLabelText(/Tags/)).toHaveValue("");
    expect(screen.getByLabelText("Post")).toHaveValue("");
  });

  it("updates the title count and previews at most five unique normalized tags", async () => {
    const user = userEvent.setup();
    render(<Composer />);
    await user.click(screen.getByRole("button", { name: "Header new thread" }));

    await user.type(screen.getByLabelText("Title"), "A clear title");
    await user.type(screen.getByLabelText(/Tags/), " API, api, Showcase, Help, Question, Design, Extra");

    expect(screen.getByText("13/160")).toBeInTheDocument();
    expect(screen.getByText("5/5 tags")).toBeInTheDocument();
    expect(screen.getByText("#api")).toBeInTheDocument();
    expect(screen.getAllByText("#api")).toHaveLength(1);
    expect(screen.getByText("#design")).toBeInTheDocument();
    expect(screen.queryByText("#extra")).not.toBeInTheDocument();
  });

  it("closes on Escape and when the pathname changes", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Composer />);
    const trigger = screen.getByRole("button", { name: "Header new thread" });
    await user.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Start a discussion" });

    fireEvent(dialog, new Event("cancel", { bubbles: true, cancelable: true }));
    expect(dialog).not.toHaveAttribute("open");
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    navigation.pathname = "/t/a-new-thread";
    rerender(<Composer />);
    await waitFor(() => expect(dialog).not.toHaveAttribute("open"));
  });

  it("routes signed-out triggers to sign-in without opening a dialog", async () => {
    const user = userEvent.setup();
    render(<Composer isAuthenticated={false} />);

    await user.click(screen.getByRole("button", { name: "Header new thread" }));

    expect(navigation.push).toHaveBeenCalledWith("/sign-in");
    expect(screen.queryByRole("dialog", { hidden: true })).not.toBeInTheDocument();
  });

  it("hides every discussion trigger while no spaces exist", () => {
    render(<Composer categories={[]} />);
    expect(screen.queryByRole("button", { name: "Header new thread" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Category new thread" })).not.toBeInTheDocument();
  });

  it("only offers open spaces to members and moderators", async () => {
    const user = userEvent.setup();
    const categories = [
      { id: "open", name: "Open", postingPolicy: "OPEN" as const },
      { id: "news", name: "News", postingPolicy: "ANNOUNCEMENTS" as const },
      { id: "staff", name: "Staff", postingPolicy: "ADMIN_ONLY" as const },
    ];
    const { rerender } = render(<Composer categories={categories} />);

    await user.click(screen.getByRole("button", { name: "Header new thread" }));
    expect(screen.getByRole("option", { name: "Open" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "News" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Staff" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Close new thread dialog" }));
    rerender(<Composer viewerRole="MODERATOR" categories={categories} />);
    await user.click(screen.getByRole("button", { name: "Header new thread" }));
    expect(screen.queryByRole("option", { name: "News" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Staff" })).not.toBeInTheDocument();
  });

  it("offers every space to admins", async () => {
    const user = userEvent.setup();
    render(<Composer viewerRole="ADMIN" categories={[
      { id: "open", name: "Open", postingPolicy: "OPEN" },
      { id: "news", name: "News", postingPolicy: "ANNOUNCEMENTS" },
      { id: "staff", name: "Staff", postingPolicy: "ADMIN_ONLY" },
    ]} />);

    await user.click(screen.getByRole("button", { name: "Header new thread" }));
    expect(screen.getByRole("option", { name: "Open" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "News" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Staff" })).toBeInTheDocument();
  });

  it("shows poll controls only to staff and resets the complete poll draft", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Composer />);
    await user.click(screen.getByRole("button", { name: "Header new thread" }));
    expect(screen.queryByRole("checkbox", { name: "Add a poll" })).not.toBeInTheDocument();
    unmount();

    render(<Composer viewerRole="MODERATOR" />);
    await user.click(screen.getByRole("button", { name: "Header new thread" }));
    await user.click(screen.getByRole("checkbox", { name: "Add a poll" }));
    expect(screen.getByLabelText("Poll question")).toHaveAttribute("maxlength", "240");
    expect(screen.getByLabelText("Poll choice 1")).toBeRequired();
    expect(screen.getByLabelText("Poll choice 2")).toBeRequired();
    expect(screen.getByLabelText("Poll duration")).toHaveValue("7d");
    await user.type(screen.getByLabelText("Poll question"), "A drafted question");
    await user.type(screen.getByLabelText("Poll choice 1"), "First");
    await user.type(screen.getByLabelText("Poll choice 2"), " first ");
    expect(screen.getAllByText("Choices must be unique.")).toHaveLength(2);
    expect(screen.getByLabelText("Poll choice 2")).toHaveAttribute("aria-invalid", "true");
    await user.clear(screen.getByLabelText("Poll choice 2"));
    await user.click(screen.getByRole("button", { name: "Add choice" }));
    expect(screen.getByLabelText("Poll choice 3")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove poll choice 2" }));
    expect(screen.queryByLabelText("Poll choice 3")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Close new thread dialog" }));
    await user.click(screen.getByRole("button", { name: "Header new thread" }));
    expect(screen.getByRole("checkbox", { name: "Add a poll" })).not.toBeChecked();
    expect(screen.queryByLabelText("Poll question")).not.toBeInTheDocument();
  });
});
