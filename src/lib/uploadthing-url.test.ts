import { describe, expect, it } from "vitest";
import { isUploadThingUrl } from "./uploadthing-url";

describe("UploadThing URL detection", () => {
  it("recognizes current and legacy UploadThing hosts", () => {
    expect(isUploadThingUrl("https://utfs.io/f/file-key")).toBe(true);
    expect(isUploadThingUrl("https://example-app.ufs.sh/f/file-key")).toBe(true);
    expect(isUploadThingUrl("https://ufs.sh/f/file-key")).toBe(true);
  });

  it("does not hide external or malformed image URLs", () => {
    expect(isUploadThingUrl("https://images.example.com/photo.jpg")).toBe(false);
    expect(isUploadThingUrl("not-a-url")).toBe(false);
    expect(isUploadThingUrl("http://utfs.io/f/file-key")).toBe(false);
  });
});
