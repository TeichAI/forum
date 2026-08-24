import { afterEach, describe, expect, it, vi } from "vitest";

describe("UploadThing route capability", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("rejects GET and POST requests without initializing UploadThing", async () => {
    vi.stubEnv("UPLOADTHING_TOKEN", "");
    const { GET, POST } = await import("./route");

    const getResponse = await GET({} as never);
    const postResponse = await POST({} as never);

    expect(getResponse.status).toBe(503);
    expect(postResponse.status).toBe(503);
    await expect(getResponse.json()).resolves.toEqual({ error: "Image uploads are not enabled." });
    await expect(postResponse.json()).resolves.toEqual({ error: "Image uploads are not enabled." });
  });

  it("exposes the configured file router when a token is present", async () => {
    vi.stubEnv("UPLOADTHING_TOKEN", "configured-for-route-discovery");
    const [{ GET }, { NextRequest }] = await Promise.all([import("./route"), import("next/server")]);

    const response = await GET(new NextRequest("http://localhost/api/uploadthing"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(expect.arrayContaining([expect.objectContaining({ slug: "imageUploader" })]));
  });
});
