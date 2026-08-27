"use client";

import { LoaderCircle } from "lucide-react";
import Image from "next/image";

export const SOCIAL_CONNECTIONS = [
  { strategy: "oauth_github", provider: "github", name: "GitHub" },
  { strategy: "oauth_huggingface", provider: "huggingface", name: "Hugging Face" },
] as const;

export type SocialConnection = (typeof SOCIAL_CONNECTIONS)[number];

function GitHubIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-[18px] w-[18px] fill-current">
      <path d="M12 .7a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2.23c-3.22.7-3.9-1.37-3.9-1.37-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.71.08-.71 1.17.08 1.78 1.2 1.78 1.2 1.04 1.78 2.72 1.27 3.38.97.1-.75.4-1.27.74-1.56-2.57-.3-5.27-1.29-5.27-5.69 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.16 1.18a10.9 10.9 0 0 1 5.76 0c2.19-1.49 3.16-1.18 3.16-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.42-2.71 5.39-5.29 5.68.42.36.79 1.07.79 2.16v3.21c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .7Z" />
    </svg>
  );
}

export function SocialConnectionIcon({ connection }: { connection: SocialConnection }) {
  if (connection.provider === "github") return <GitHubIcon />;
  if (connection.provider === "huggingface") {
    return <Image src="/hugging-face-logo.svg" alt="" aria-hidden="true" width={19} height={18} />;
  }
  return null;
}

export function SocialConnections({
  busy,
  connecting,
  onConnect,
}: {
  busy: boolean;
  connecting: SocialConnection["strategy"] | null;
  onConnect: (connection: SocialConnection) => void | Promise<void>;
}) {
  return (
    <div className="mb-6 space-y-3">
      {SOCIAL_CONNECTIONS.map((connection) => {
        const isConnecting = connecting === connection.strategy;
        return (
          <button
            key={connection.strategy}
            type="button"
            disabled={busy}
            onClick={() => void onConnect(connection)}
            className="button w-full border !py-3 font-extrabold hover:bg-[var(--surface-soft)]"
            style={{ borderColor: "var(--line)", background: "var(--surface)" }}
          >
            {isConnecting ? <LoaderCircle aria-hidden="true" className="animate-spin" size={18} /> : <SocialConnectionIcon connection={connection} />}
            {isConnecting ? `Connecting to ${connection.name}…` : `Continue with ${connection.name}`}
          </button>
        );
      })}
      <div className="!mt-6 flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-[var(--line)]" />
        <span className="text-[11px] font-bold uppercase tracking-[0.14em] muted">or continue with email</span>
        <span className="h-px flex-1 bg-[var(--line)]" />
      </div>
    </div>
  );
}
