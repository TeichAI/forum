import type { NextRequest } from "next/server";
import { createRouteHandler } from "uploadthing/next";
import { uploadsEnabled } from "@/lib/upload-capability";
import { getViewer } from "@/lib/auth";
import { consumeUserMutation, RATE_LIMIT_POLICIES, rateLimitedActionState } from "@/lib/rate-limit";
import { ourFileRouter } from "./core";

const handlers = uploadsEnabled() ? createRouteHandler({ router: ourFileRouter }) : null;

function unavailable() {
  return Response.json({ error: "Image uploads are not enabled." }, { status: 503 });
}

export function GET(request: NextRequest) {
  return handlers ? handlers.GET(request) : unavailable();
}

export async function POST(request: NextRequest) {
  if (!handlers) return unavailable();
  // UploadThing authenticates callback/error hooks with its own request signature.
  if (request.headers.get("uploadthing-hook")) return handlers.POST(request);
  const viewer = await getViewer();
  if (!viewer) return Response.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  const rateLimit = await consumeUserMutation(viewer, RATE_LIMIT_POLICIES.upload);
  if (!rateLimit.allowed) {
    const state = rateLimitedActionState(rateLimit);
    const storageUnavailable = rateLimit.outcome === "storage_unavailable";
    return Response.json(
      { error: state.message },
      {
        status: storageUnavailable ? 503 : 429,
        headers: { "Retry-After": String(storageUnavailable ? 30 : rateLimit.retryAfterSeconds), "Cache-Control": "private, no-store" },
      },
    );
  }
  return handlers.POST(request);
}
