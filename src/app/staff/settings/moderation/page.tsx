import { saveModerationSettings } from "@/actions/staff";
import { StaffActionForm } from "@/components/staff/action-form";
import { requireAdmin } from "@/lib/auth";
import { getModerationSettings } from "@/lib/moderation";

export default async function ModerationSettingsPage() {
  await requireAdmin();
  const settings = await getModerationSettings();
  return <section><div className="eyebrow">Administration</div><h2 className="mt-1 text-2xl font-black">Moderation presets</h2><p className="mt-1 max-w-2xl text-sm leading-6 muted">These ordered values appear in member reporting and staff action forms. Staff can still write a specific reason when a preset does not fit.</p><StaffActionForm action={saveModerationSettings} className="card mt-5 space-y-5 p-5 sm:p-6"><div><label className="label" htmlFor="report-reasons">Report reasons</label><textarea className="input" id="report-reasons" name="reportReasons" rows={6} defaultValue={settings.reportReasons.join("\n")} /><p className="mt-1 text-xs muted">One reason per line. Keep “Other” when members may need a custom explanation.</p></div><div><label className="label" htmlFor="suspension-days">Suspension durations in days</label><input className="input" id="suspension-days" name="suspensionDurationsDays" defaultValue={settings.suspensionDurationsDays.join(", ")} /><p className="mt-1 text-xs muted">Comma-separated values from 1 to 365.</p></div><div><label className="label" htmlFor="action-reasons-settings">Reusable action reasons</label><textarea className="input" id="action-reasons-settings" name="actionReasons" rows={7} defaultValue={settings.actionReasons.join("\n")} /></div><button className="button button-primary">Save presets</button></StaffActionForm></section>;
}
