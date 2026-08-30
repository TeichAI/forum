import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createReply: vi.fn() }));
vi.mock("@/actions/forum", () => ({ createReply: mocks.createReply }));
vi.mock("@/components/markdown-editor-client", () => ({
  MarkdownEditorClient: ({ placeholder }: { placeholder: string }) => {
    const [value, setValue] = useState("");
    return <textarea name="body" placeholder={placeholder} value={value} onChange={(event) => setValue(event.target.value)} />;
  },
}));

import { NestedReplyComposer, NestedReplyControl, ReplyComposerProvider } from "./nested-reply-composer";

function ReplyComposers({ enabled = true }: { enabled?: boolean }) {
  return enabled ? (
    <ReplyComposerProvider>
      <NestedReplyControl replyId="reply-one" authorName="One" />
      <NestedReplyComposer threadId="thread" parentReplyId="reply-one" authorName="One" uploadsEnabled={false} />
      <NestedReplyControl replyId="reply-two" authorName="Two" />
      <NestedReplyComposer threadId="thread" parentReplyId="reply-two" authorName="Two" uploadsEnabled={false} />
    </ReplyComposerProvider>
  ) : <p>Posting unavailable</p>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createReply.mockResolvedValue({ status: "success", replyId: "created" });
});

describe("nested reply composer", () => {
  it("opens, switches, and cancels the single inline composer", () => {
    render(<ReplyComposers />);
    fireEvent.click(screen.getByRole("button", { name: "Reply to One" }));
    expect(screen.getByPlaceholderText("Reply to One…")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reply to Two" }));
    expect(screen.queryByPlaceholderText("Reply to One…")).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("Reply to Two…")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByPlaceholderText("Reply to Two…")).not.toBeInTheDocument();
  });

  it("submits parent context and closes only after success", async () => {
    render(<ReplyComposers />);
    fireEvent.click(screen.getByRole("button", { name: "Reply to One" }));
    fireEvent.change(screen.getByPlaceholderText("Reply to One…"), { target: { value: "Nested body" } });
    fireEvent.click(screen.getByRole("button", { name: "Post reply" }));

    await waitFor(() => expect(mocks.createReply).toHaveBeenCalled());
    const data = mocks.createReply.mock.calls[0][0] as FormData;
    expect(Object.fromEntries(data)).toEqual({ threadId: "thread", parentReplyId: "reply-one", body: "Nested body" });
    await waitFor(() => expect(screen.queryByPlaceholderText("Reply to One…")).not.toBeInTheDocument());
  });

  it("keeps the composer and draft open when submission is rate limited", async () => {
    mocks.createReply.mockResolvedValue({
      status: "rate_limited",
      message: "Please slow down.",
    });
    render(<ReplyComposers />);
    fireEvent.click(screen.getByRole("button", { name: "Reply to One" }));
    fireEvent.change(screen.getByPlaceholderText("Reply to One…"), { target: { value: "Careful draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Post reply" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Please slow down.");
    expect(screen.getByDisplayValue("Careful draft")).toBeInTheDocument();
  });

  it("does not expose controls when posting is disabled by the server-rendered state", () => {
    render(<ReplyComposers enabled={false} />);
    expect(screen.queryByRole("button", { name: /Reply to/ })).not.toBeInTheDocument();
  });
});
