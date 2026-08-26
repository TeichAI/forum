export class BodyTooLargeError extends Error {
  constructor() {
    super("Request body exceeds the allowed size");
    this.name = "BodyTooLargeError";
  }
}

async function cancel(reader: ReadableStreamDefaultReader<Uint8Array>) {
  try {
    await reader.cancel();
  } catch {
    // The size rejection is authoritative even if the source cannot be cancelled.
  }
}

export async function readBoundedBody(request: Request, maxBytes: number) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) throw new RangeError("maxBytes must be a non-negative integer");
  const reader = request.body?.getReader();
  if (!reader) return "";
  const declared = request.headers.get("content-length")?.trim();
  if (declared && /^\d+$/.test(declared) && Number(declared) > maxBytes) {
    await cancel(reader);
    throw new BodyTooLargeError();
  }

  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await cancel(reader);
        throw new BodyTooLargeError();
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}
