import { getViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { getPollSnapshot } from "@/lib/poll-data";
import { canAccessPollThread } from "@/lib/poll-access";

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store" };

function unavailable() {
  return Response.json({ error: "Poll not found" }, { status: 404, headers: PRIVATE_HEADERS });
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
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
  const snapshot = await getPollSnapshot(id, viewer?.id);
  return snapshot ? Response.json(snapshot, { headers: PRIVATE_HEADERS }) : unavailable();
}
