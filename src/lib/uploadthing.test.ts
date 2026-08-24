import { expect, it, vi } from "vitest";

const generated = vi.hoisted(() => vi.fn(() => "generated-upload-button"));
vi.mock("@uploadthing/react", () => ({ generateUploadButton: generated }));

import { UploadButton } from "./uploadthing";

it("exports the UploadThing React component factory result", () => {
  expect(generated).toHaveBeenCalledOnce();
  expect(UploadButton).toBe("generated-upload-button");
});
