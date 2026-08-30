"use client";

import { useState } from "react";
import { ImagePlus } from "lucide-react";
import { UploadButton } from "@/lib/uploadthing";
import { RateLimitCountdown, useRateLimitCooldown } from "@/components/rate-limit-countdown";

export type MarkdownEditorProps = {
  id?: string;
  name?: string;
  minLength?: number;
  placeholder?: string;
  rows?: number;
  initialValue?: string;
};

export function MarkdownEditorClient({
  id,
  name = "body",
  minLength = 2,
  placeholder = "Write your thoughts…",
  rows = 8,
  initialValue = "",
  uploadsEnabled,
}: MarkdownEditorProps & { uploadsEnabled: boolean }) {
  const [value, setValue] = useState(initialValue);
  const [uploadError, setUploadError] = useState("");
  const [uploadLimit, setUploadLimit] = useState<object | null>(null);
  const { coolingDown, onReady } = useRateLimitCooldown(uploadLimit);

  return (
    <div className="overflow-hidden rounded-xl border focus-within:border-[var(--brand)] focus-within:shadow-[var(--focus-ring)] transition-shadow" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2 text-xs" style={{ borderColor: "var(--line)", color: "var(--muted)" }}>
        <span className="leading-5">Markdown supported · <span className="hidden sm:inline">use @username to mention</span></span>
        {uploadsEnabled && coolingDown ? (
          <button type="button" className="button button-ghost !h-7 !px-2.5 !text-xs" disabled><ImagePlus size={13} aria-hidden /> Add image</button>
        ) : uploadsEnabled ? (
          <UploadButton
            endpoint="imageUploader"
            appearance={{ button: "button button-ghost !h-7 !px-2.5 !text-xs", allowedContent: "hidden" }}
            content={{ button: <><ImagePlus size={13} aria-hidden /> Add image</> }}
            onClientUploadComplete={(files) => {
              setUploadError("");
              setUploadLimit(null);
              const file = files[0];
              if (file?.serverData?.url) setValue((current) => `${current}${current ? "\n\n" : ""}![${file.name}](${file.serverData.url})`);
            }}
            onUploadError={(error) => {
              setUploadError(error.message);
              setUploadLimit(/too quickly|temporary security check/i.test(error.message) ? {} : null);
            }}
          />
        ) : null}
      </div>
      {uploadError ? (
        <div className="border-b px-3 py-2 text-xs font-semibold" style={{ borderColor: "var(--line)", color: "var(--danger)" }} role="alert">
          {uploadError}
          {uploadLimit ? <div className="mt-1"><RateLimitCountdown trigger={uploadLimit} onReady={onReady} className="text-xs font-semibold" /></div> : null}
        </div>
      ) : null}
      <textarea
        id={id}
        className="w-full resize-y bg-transparent p-3.5 text-[0.92rem] leading-6 outline-none placeholder:text-[var(--muted)]"
        style={{ minHeight: `${rows * 1.42}rem`, color: "var(--foreground)" }}
        name={name}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        minLength={minLength}
        maxLength={50_000}
        placeholder={placeholder}
        required
        aria-label={id ? undefined : "Post body"}
      />
      <div className="flex items-center justify-between border-t px-3 py-2 text-xs muted" style={{ borderColor: "var(--line)" }}>
        <span>{value.length.toLocaleString()} characters</span>
        <span className="hidden sm:inline">Supports headings, lists, code, and links</span>
      </div>
    </div>
  );
}
