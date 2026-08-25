import { Mailbox } from "@/components/mail/mailbox";
import { MailReader } from "@/components/mail/mail-reader";
import { requireUser } from "@/lib/auth";
import { normalizeMailFolder } from "@/lib/mail";

export const dynamic = "force-dynamic";

export default async function MailThreadPage({ params, searchParams }: { params: Promise<{ threadId: string }>; searchParams: Promise<{ folder?: string; q?: string; cursor?: string }> }) {
  const user = await requireUser();
  const [{ threadId }, query] = await Promise.all([params, searchParams]);
  const folder = normalizeMailFolder(query.folder);
  return <div className="shell mail-page"><Mailbox userId={user.id} folder={folder} query={query.q?.slice(0, 100) ?? ""} cursor={query.cursor} selectedId={threadId}><MailReader userId={user.id} threadId={threadId} folder={folder} /></Mailbox></div>;
}
