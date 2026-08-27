import { notFound } from "next/navigation";
import { MailComposer } from "@/components/mail/mail-composer";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getMailDraft } from "@/lib/mail";
import { uploadsEnabled } from "@/lib/upload-capability";
import { privateMetadata } from "@/lib/metadata";

export const dynamic = "force-dynamic";
export const metadata = privateMetadata("Compose mail");

export default async function ComposeMailPage({ searchParams }: { searchParams: Promise<{ to?: string; draft?: string }> }) {
  const user = await requireUser();
  const query = await searchParams;
  const draft = query.draft ? await getMailDraft(user.id, query.draft) : null;
  if (query.draft && !draft) notFound();
  const preaddressed = !draft && query.to && query.to !== user.id ? await db.user.findFirst({
    where: { id: query.to, status: "ACTIVE" },
    select: { id: true, displayName: true, username: true, imageUrl: true, role: true },
  }) : null;
  return <div className="shell mail-compose-page card"><MailComposer role={user.role} initialRecipients={preaddressed ? [preaddressed] : []} uploadsEnabled={uploadsEnabled()} draft={draft ? { id: draft.id, threadId: draft.threadId, subject: draft.subject, body: draft.body, recipients: draft.recipients.map((item) => item.recipient) } : undefined} /></div>;
}
