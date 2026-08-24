import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ enabled: vi.fn() }));
vi.mock("@/lib/upload-capability", () => ({ uploadsEnabled: mocks.enabled }));
vi.mock("@/components/markdown-editor-client", () => ({ MarkdownEditorClient: (props: { uploadsEnabled: boolean; initialValue?: string }) => <div data-enabled={props.uploadsEnabled}>{props.initialValue}</div> }));

import { MarkdownEditor } from "./markdown-editor";

it("passes upload capability and editor props to the client", () => {
  mocks.enabled.mockReturnValue(true);
  render(<MarkdownEditor initialValue="Draft" />);
  expect(screen.getByText("Draft")).toHaveAttribute("data-enabled", "true");
});
