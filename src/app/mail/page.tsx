import { Mailbox } from "@/components/mail/mailbox";
import { requireUser } from "@/lib/auth";
import { normalizeMailFolder } from "@/lib/mail";

export const dynamic = "force-dynamic";

export default async function MailPage({ searchParams }: { searchParams: Promise<{ folder?: string; q?: string; cursor?: string }> }) {
  const user = await requireUser();
  const query = await searchParams;
  return <div className="shell mail-page"><Mailbox userId={user.id} folder={normalizeMailFolder(query.folder)} query={query.q?.slice(0, 100) ?? ""} cursor={query.cursor} /></div>;
}
