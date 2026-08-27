import { Mailbox } from "@/components/mail/mailbox";
import { MailReader } from "@/components/mail/mail-reader";
import { requireUser } from "@/lib/auth";
import { normalizeMailFolder, normalizeStaffMailFolder } from "@/lib/mail";
import { isCurrentMailStaff } from "@/lib/mail-access";

export const dynamic = "force-dynamic";

export default async function MailThreadPage({ params, searchParams }: { params: Promise<{ threadId: string }>; searchParams: Promise<{ folder?: string; staffFolder?: string; q?: string; cursor?: string }> }) {
  const user = await requireUser();
  const [{ threadId }, query] = await Promise.all([params, searchParams]);
  const staffAccess = await isCurrentMailStaff(user);
  const requestedFolder = normalizeMailFolder(query.folder);
  const folder = requestedFolder === "staff" && !staffAccess ? "inbox" : requestedFolder;
  const staffFolder = normalizeStaffMailFolder(query.staffFolder);
  return <div className="shell mail-page"><Mailbox viewer={user} folder={folder} staffFolder={staffFolder} staffAccess={staffAccess} query={query.q?.slice(0, 100) ?? ""} cursor={query.cursor} selectedId={threadId}><MailReader viewer={user} threadId={threadId} folder={folder} staffFolder={staffFolder} /></Mailbox></div>;
}
