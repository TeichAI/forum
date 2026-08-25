"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { MessageCircle } from "lucide-react";
import { createReply } from "@/actions/forum";
import { MarkdownEditorClient } from "@/components/markdown-editor-client";
import { RateLimitForm } from "@/components/ui/rate-limit-form";
import { SubmitButton } from "@/components/ui/submit-button";

type ReplyComposerContextValue = {
  openReplyId: string | null;
  openComposer: (replyId: string) => void;
  closeComposer: () => void;
};

const ReplyComposerContext = createContext<ReplyComposerContextValue | null>(null);

function useReplyComposer() {
  const context = useContext(ReplyComposerContext);
  if (!context) throw new Error("Nested reply controls must be inside ReplyComposerProvider");
  return context;
}

export function ReplyComposerProvider({ children }: { children: React.ReactNode }) {
  const [openReplyId, setOpenReplyId] = useState<string | null>(null);
  const openComposer = useCallback((replyId: string) => setOpenReplyId(replyId), []);
  const closeComposer = useCallback(() => setOpenReplyId(null), []);
  const value = useMemo(() => ({ openReplyId, openComposer, closeComposer }), [closeComposer, openComposer, openReplyId]);
  return <ReplyComposerContext.Provider value={value}>{children}</ReplyComposerContext.Provider>;
}

export function NestedReplyControl({ replyId, authorName }: { replyId: string; authorName: string }) {
  const { openComposer } = useReplyComposer();
  return (
    <button type="button" className="button button-ghost !min-h-0 !px-2.5 !py-1.5" onClick={() => openComposer(replyId)} aria-label={`Reply to ${authorName}`}>
      <MessageCircle size={14} aria-hidden /> Reply
    </button>
  );
}

export function NestedReplyComposer({ threadId, parentReplyId, authorName, uploadsEnabled }: { threadId: string; parentReplyId: string; authorName: string; uploadsEnabled: boolean }) {
  const { openReplyId, closeComposer } = useReplyComposer();
  if (openReplyId !== parentReplyId) return null;

  return (
    <div className="mt-3 rounded-xl border p-4" style={{ borderColor: "var(--line)", background: "var(--surface-soft)" }}>
      <p className="mb-3 text-sm font-bold">Reply to {authorName}</p>
      <RateLimitForm action={createReply} onSuccess={closeComposer}>
        <input type="hidden" name="threadId" value={threadId} />
        <input type="hidden" name="parentReplyId" value={parentReplyId} />
        <MarkdownEditorClient rows={4} placeholder={`Reply to ${authorName}…`} uploadsEnabled={uploadsEnabled} />
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" className="button button-secondary" onClick={closeComposer}>Cancel</button>
          <SubmitButton pendingLabel="Posting…">Post reply</SubmitButton>
        </div>
      </RateLimitForm>
    </div>
  );
}
