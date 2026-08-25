import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const upload = vi.hoisted(() => ({ props: null as null | Record<string, unknown> }));
vi.mock("@/lib/uploadthing", () => ({ UploadButton: (props: Record<string, unknown>) => { upload.props = props; return <button type="button">Fake upload</button>; } }));

import { MarkdownEditorClient } from "./markdown-editor-client";

beforeEach(() => { upload.props = null; });

describe("MarkdownEditorClient", () => {
  it("uses controlled input defaults without an upload control", () => {
    render(<MarkdownEditorClient uploadsEnabled={false} name="message" initialValue="Hello" rows={3} />);
    const input = screen.getByRole("textbox");
    expect(input).toHaveAttribute("name", "message");
    expect(input).toHaveValue("Hello");
    expect(screen.getByText("5 characters")).toBeInTheDocument();
    fireEvent.change(input, { target: { value: "Changed" } });
    expect(input).toHaveValue("Changed");
    expect(screen.getByText("7 characters")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Fake upload" })).not.toBeInTheDocument();
  });

  it("appends completed uploads and surfaces errors", () => {
    render(<MarkdownEditorClient uploadsEnabled initialValue="Intro" />);
    expect(screen.getByRole("button", { name: "Fake upload" })).toBeInTheDocument();
    act(() => (upload.props!.onClientUploadComplete as (files: unknown[]) => void)([{ name: "pond.png", serverData: { url: "https://app.ufs.sh/f/key" } }]));
    expect(screen.getByRole("textbox")).toHaveValue("Intro\n\n![pond.png](https://app.ufs.sh/f/key)");
    act(() => (upload.props!.onClientUploadComplete as (files: unknown[]) => void)([]));
    act(() => (upload.props!.onUploadError as (error: Error) => void)(new Error("Upload failed")));
    expect(screen.getByRole("alert")).toHaveTextContent("Upload failed");
  });
});
