import { AccountSecurity } from "@/components/account/account-security";
import { ProfileSettings } from "@/components/account/profile-settings";
import { requireUser } from "@/lib/auth";
import { isE2ETestMode } from "@/lib/e2e-auth";
import { privateMetadata } from "@/lib/metadata";

export const dynamic = "force-dynamic";
export const metadata = privateMetadata("Account settings");
export default async function SettingsPage() {
  const user = await requireUser();
  const identityControlsEnabled = !isE2ETestMode();
  return (
    <div className="shell max-w-3xl py-9">
      <div className="eyebrow">Account</div>
      <h1 className="mt-1 text-3xl font-black">Account settings</h1>
      <p className="mt-2 muted">Manage your forum profile, sign-in details, and active devices.</p>
      <div className="mt-7 space-y-6">
        <ProfileSettings displayName={user.displayName} username={user.username} bio={user.bio} />
        {identityControlsEnabled && <AccountSecurity displayName={user.displayName} username={user.username} imageUrl={user.imageUrl} />}
      </div>
    </div>
  );
}
