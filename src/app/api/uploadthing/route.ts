import type { NextRequest } from "next/server";
import { createRouteHandler } from "uploadthing/next";
import { uploadsEnabled } from "@/lib/upload-capability";
import { ourFileRouter } from "./core";

const handlers = uploadsEnabled() ? createRouteHandler({ router: ourFileRouter }) : null;

function unavailable() {
  return Response.json({ error: "Image uploads are not enabled." }, { status: 503 });
}

export function GET(request: NextRequest) {
  return handlers ? handlers.GET(request) : unavailable();
}

export function POST(request: NextRequest) {
  return handlers ? handlers.POST(request) : unavailable();
}
