import Link from "next/link";

export function LegalConsent({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="mt-5 flex items-start gap-2.5 text-xs leading-5 muted">
      <input
        id="legal-accepted"
        name="legalAccepted"
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        required
        className="mt-1 accent-[var(--brand)]"
      />
      <span>
        I agree to the Teich Forum <Link href="/terms" className="legal-inline-link">Terms of Service</Link>, including the community standards, and acknowledge the <Link href="/privacy" className="legal-inline-link">Privacy Policy</Link>.
      </span>
    </label>
  );
}
