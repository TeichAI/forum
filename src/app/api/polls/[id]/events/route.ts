import { getViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { canAccessPollThread } from "@/lib/poll-access";
import { subscribeToPoll } from "@/lib/poll-events";
import { consumeRateLimit, RATE_LIMIT_POLICIES, railwayClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 20_000;
const ROTATE_MS = 14 * 60_000;
const STREAM_HEADERS = {
  "Cache-Control": "private, no-cache, no-store, no-transform",
  "Content-Type": "text/event-stream; charset=utf-8",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

function unavailable() {
  return Response.json({ error: "Poll not found" }, { status: 404, headers: { "Cache-Control": "private, no-store" } });
}

function limited(status: 429 | 503, retryAfterSeconds: number) {
  return Response.json(
    { error: status === 429 ? "Too many stream connections" : "Streaming is temporarily unavailable" },
    { status, headers: { "Cache-Control": "private, no-store", "Retry-After": String(retryAfterSeconds) } },
  );
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  const { id } = await context.params;
  const poll = await db.poll.findUnique({
    where: { id },
    select: {
      thread: {
        select: {
          status: true,
          author: { select: { status: true } },
          category: { select: { archivedAt: true } },
        },
      },
    },
  });
  if (!poll || !await canAccessPollThread(poll.thread, viewer)) return unavailable();

  const ip = railwayClientIp(request.headers) ?? "unavailable";
  const rateLimit = await consumeRateLimit(
    viewer ? { kind: "user", value: viewer.clerkId } : { kind: "ip", value: ip },
    [viewer ? RATE_LIMIT_POLICIES.pollStreamUser : RATE_LIMIT_POLICIES.pollStreamAnonymous],
    { storageFailure: "deny" },
  );
  if (!rateLimit.allowed) {
    return limited(rateLimit.outcome === "storage_unavailable" ? 503 : 429, rateLimit.retryAfterSeconds);
  }

  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let rotation: ReturnType<typeof setTimeout> | undefined;
  let closed = false;
  let unsubscribe: () => void = () => undefined;
  const cleanup = () => {
    if (closed) return;
    closed = true;
    if (heartbeat) clearInterval(heartbeat);
    if (rotation) clearTimeout(rotation);
    request.signal.removeEventListener("abort", cleanup);
    unsubscribe();
  };
  const close = () => {
    cleanup();
    try { controller?.close(); } catch { /* The browser already closed the stream. */ }
  };
  const send = (event: "connected" | "refresh") => {
    if (!closed) controller?.enqueue(encoder.encode(`event: ${event}\ndata: refresh\n\n`));
  };

  try {
    unsubscribe = await subscribeToPoll(id, () => send("refresh"));
  } catch (error) {
    console.error(JSON.stringify({ event: "poll_events.subscribe_failed", error: error instanceof Error ? error.name : "UnknownError" }));
    return limited(503, 30);
  }

  const stream = new ReadableStream<Uint8Array>({
    start(nextController) {
      controller = nextController;
      request.signal.addEventListener("abort", cleanup, { once: true });
      send("connected");
      heartbeat = setInterval(() => {
        if (!closed) controller?.enqueue(encoder.encode(": heartbeat\n\n"));
      }, HEARTBEAT_MS);
      rotation = setTimeout(close, ROTATE_MS);
      if (request.signal.aborted) cleanup();
    },
    cancel: cleanup,
  });
  return new Response(stream, { headers: STREAM_HEADERS });
}
