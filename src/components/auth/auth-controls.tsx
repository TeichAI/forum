"use client";

import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import { useState } from "react";

type PasswordInputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  error?: string;
};

export function PasswordInput({ error, className = "", ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        {...props}
        type={visible ? "text" : "password"}
        className={`input !pr-11 ${error ? "!border-[var(--danger)]" : ""} ${className}`}
        aria-invalid={Boolean(error)}
      />
      <button
        type="button"
        disabled={props.disabled}
        onClick={() => setVisible((value) => !value)}
        className="absolute right-1.5 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg muted hover:bg-[var(--surface-soft)] hover:text-[var(--foreground)]"
        aria-label={visible ? "Hide password" : "Show password"}
      >
        {visible ? <EyeOff size={17} /> : <Eye size={17} />}
      </button>
    </div>
  );
}

export function FieldMessage({ id, children }: { id?: string; children?: React.ReactNode }) {
  if (!children) return null;
  return <p id={id} className="mt-1.5 text-xs font-semibold" style={{ color: "var(--danger)" }}>{children}</p>;
}

export function FormAlert({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <div role="alert" aria-live="polite" className="mb-5 rounded-xl border px-3.5 py-3 text-sm leading-5" style={{ borderColor: "color-mix(in srgb, var(--danger) 28%, var(--line))", background: "color-mix(in srgb, var(--danger) 8%, var(--surface))", color: "var(--danger)" }}>
      {children}
    </div>
  );
}

export function SubmitButton({ busy, busyLabel, children }: { busy: boolean; busyLabel: string; children: React.ReactNode }) {
  return (
    <button type="submit" disabled={busy} className="button button-primary mt-2 w-full !py-3">
      {busy && <LoaderCircle className="animate-spin" size={17} />}
      {busy ? busyLabel : children}
    </button>
  );
}

export function CodeInput({ className = "", inputMode = "numeric", maxLength = 6, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`input text-center !py-3 text-xl font-black tracking-[0.35em] ${className}`}
      inputMode={inputMode}
      autoComplete="one-time-code"
      maxLength={maxLength}
    />
  );
}
