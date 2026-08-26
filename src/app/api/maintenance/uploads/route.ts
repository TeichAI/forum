import { timingSafeEqual } from "node:crypto";
import { UTApi } from "uploadthing/server";
import { cleanupUnclaimedUploads } from "@/lib/upload-cleanup";
import { optionalRuntimeSecret } from "@/lib/env";

function authorized(request: Request, secret: string) {
  const actualBytes = Buffer.from(request.headers.get("authorization") ?? "");
  const expectedBytes = Buffer.from(`Bearer ${secret}`);
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

export async function POST(request: Request) {
  const secret = optionalRuntimeSecret("CRON_SECRET");
  if (!secret) return Response.json({ error: "Maintenance endpoint is not configured" }, { status: 503 });
  if (!authorized(request, secret)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!optionalRuntimeSecret("UPLOADTHING_TOKEN")) return Response.json({ error: "Uploads are not configured" }, { status: 503 });
  return Response.json(await cleanupUnclaimedUploads({ storage: new UTApi() }));
}
