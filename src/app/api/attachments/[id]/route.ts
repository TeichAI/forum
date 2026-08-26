import { UTApi } from "uploadthing/server";
import { canAccessPrivateAttachment } from "@/lib/attachment-access";
import { getViewer } from "@/lib/auth";
import { db } from "@/lib/db";

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store" };

function privateResponse(status: number) {
  return new Response(null, { status, headers: PRIVATE_HEADERS });
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  if (!viewer) return privateResponse(401);
  const { id } = await context.params;
  const attachment = await db.attachment.findFirst({
    where: { id, access: "PRIVATE" },
    select: { key: true, userId: true, context: true, targetId: true },
  });
  if (!attachment || !await canAccessPrivateAttachment(attachment, viewer)) return privateResponse(404);

  try {
    const { ufsUrl } = await new UTApi().generateSignedURL(attachment.key, { expiresIn: "5 minutes" });
    return new Response(null, { status: 302, headers: { ...PRIVATE_HEADERS, Location: ufsUrl } });
  } catch (error) {
    console.error(JSON.stringify({
      event: "attachment.signing_failed",
      error: error instanceof Error ? error.name : "UnknownError",
    }));
    return privateResponse(503);
  }
}
