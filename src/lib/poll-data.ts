import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { pollStatus, type PollSnapshot } from "@/lib/polls";

type PollClient = Pick<Prisma.TransactionClient, "poll" | "pollVote">;

export async function getPollSnapshot(
  pollId: string,
  viewerId?: string,
  client: PollClient = db,
  now = new Date(),
): Promise<PollSnapshot | null> {
  const [poll, viewerVote] = await Promise.all([
    client.poll.findUnique({
      where: { id: pollId },
      select: {
        id: true,
        question: true,
        expiresAt: true,
        options: {
          orderBy: { position: "asc" },
          select: { id: true, text: true, position: true, _count: { select: { votes: true } } },
        },
      },
    }),
    viewerId
      ? client.pollVote.findUnique({
        where: { pollId_userId: { pollId, userId: viewerId } },
        select: { optionId: true },
      })
      : Promise.resolve(null),
  ]);
  if (!poll) return null;
  const totalVotes = poll.options.reduce((total, option) => total + option._count.votes, 0);
  return {
    id: poll.id,
    question: poll.question,
    expiresAt: poll.expiresAt.toISOString(),
    status: pollStatus(poll.expiresAt, now),
    totalVotes,
    selectedOptionId: viewerVote?.optionId ?? null,
    options: poll.options.map((option) => ({
      id: option.id,
      text: option.text,
      position: option.position,
      voteCount: option._count.votes,
      percentage: totalVotes ? Math.round((option._count.votes / totalVotes) * 100) : 0,
    })),
  };
}
