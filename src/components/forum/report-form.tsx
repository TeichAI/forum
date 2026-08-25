import { Flag } from "lucide-react";
import { reportContent } from "@/actions/forum";
import { SubmitButton } from "@/components/ui/submit-button";
import { RateLimitForm } from "@/components/ui/rate-limit-form";
import { getModerationSettings } from "@/lib/moderation";

export async function ReportForm({ targetType, targetId, returnTo }: { targetType: "THREAD" | "REPLY" | "USER" | "MAIL_ENTRY"; targetId: string; returnTo: string }) {
  const settings = await getModerationSettings();
  return (
    <details className="relative">
      <summary className="list-none cursor-pointer text-xs font-semibold muted"><span className="flex items-center gap-1"><Flag size={13} /> Report</span></summary>
      <RateLimitForm action={reportContent} className="card absolute right-0 top-7 z-20 w-72 space-y-3 p-4 shadow-xl">
        <input type="hidden" name="targetType" value={targetType} /><input type="hidden" name="targetId" value={targetId} /><input type="hidden" name="returnTo" value={returnTo} />
        <div><label className="label" htmlFor={`reason-${targetId}`}>Reason</label><select className="input" id={`reason-${targetId}`} name="reason">{settings.reportReasons.map((reason) => <option key={reason}>{reason}</option>)}</select></div>
        <div><label className="label" htmlFor={`details-${targetId}`}>Details</label><textarea className="input" id={`details-${targetId}`} name="details" rows={3} maxLength={1000} /></div>
        <SubmitButton pendingLabel="Sending…" className="button button-primary w-full">Send report</SubmitButton>
      </RateLimitForm>
    </details>
  );
}
