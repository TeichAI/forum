import { describe, expect, it, vi } from "vitest";
import { BodyTooLargeError, readBoundedBody } from "./bounded-body";

function streamedRequest(chunks: string[], headers?: HeadersInit, cancel = vi.fn()) {
  const encoder = new TextEncoder();
  let index = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks[index++];
      if (chunk === undefined) controller.close();
      else controller.enqueue(encoder.encode(chunk));
    },
    cancel,
  });
  return { request: new Request("http://local", { method: "POST", headers, body, duplex: "half" } as RequestInit), cancel, pulls: () => index };
}

describe("readBoundedBody", () => {
  it("reads declared and undeclared bodies up to the byte limit", async () => {
    await expect(readBoundedBody(new Request("http://local", { method: "POST", headers: { "content-length": "5" }, body: "hello" }), 5)).resolves.toBe("hello");
    const streamed = streamedRequest(["he", "llo"]);
    await expect(readBoundedBody(streamed.request, 5)).resolves.toBe("hello");
    expect(streamed.cancel).not.toHaveBeenCalled();
  });

  it("cancels immediately when the declared size is oversized", async () => {
    const streamed = streamedRequest(["never read"], { "content-length": "100" });
    await expect(readBoundedBody(streamed.request, 10)).rejects.toBeInstanceOf(BodyTooLargeError);
    expect(streamed.cancel).toHaveBeenCalledOnce();
    expect(streamed.pulls()).toBeLessThanOrEqual(1);
  });

  it("cancels chunked input as soon as cumulative bytes exceed the limit", async () => {
    const streamed = streamedRequest(["1234", "5678", "this chunk must not be buffered"]);
    await expect(readBoundedBody(streamed.request, 6)).rejects.toBeInstanceOf(BodyTooLargeError);
    expect(streamed.cancel).toHaveBeenCalledOnce();
    expect(streamed.pulls()).toBeLessThan(3);
  });

  it("counts encoded bytes rather than JavaScript characters", async () => {
    await expect(readBoundedBody(new Request("http://local", { method: "POST", body: "🐟" }), 3)).rejects.toBeInstanceOf(BodyTooLargeError);
  });
});
