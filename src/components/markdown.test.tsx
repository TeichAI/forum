import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const enabled = vi.hoisted(() => vi.fn());
vi.mock("@/lib/upload-capability", () => ({ uploadsEnabled: enabled }));

import { Markdown } from "./markdown";

afterEach(() => vi.clearAllMocks());

describe("Markdown", () => {
  it("renders GFM and sanitizes unsafe markup", () => {
    enabled.mockReturnValue(true);
    const { container } = render(<Markdown>{"# Heading\n\n- [x] done\n\n<script>alert(1)</script>"}</Markdown>);
    expect(screen.getByRole("heading", { name: "Heading" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox")).toBeChecked();
    expect(container.querySelector("script")).toBeNull();
  });

  it("hides UploadThing images while uploads are disabled but keeps external images", () => {
    enabled.mockReturnValue(false);
    const { container } = render(<Markdown>{"![upload](https://utfs.io/f/key) ![external](https://example.com/a.png)"}</Markdown>);
    expect(container.querySelector('img[src="https://utfs.io/f/key"]')).toBeNull();
    expect(screen.getByRole("img", { name: "external" })).toBeInTheDocument();
  });
});
