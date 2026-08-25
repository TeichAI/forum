"use client";

import type { SpacePostingPolicy } from "@prisma/client";
import { createContext, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { ArrowRight, X } from "lucide-react";
import { createThread } from "@/actions/forum";
import { MarkdownEditorClient } from "@/components/markdown-editor-client";
import { SubmitButton } from "@/components/ui/submit-button";
import { RateLimitForm } from "@/components/ui/rate-limit-form";
import type { ForumRole } from "@/lib/roles";
import { canStartDiscussion } from "@/lib/space-posting-permissions";

type CategoryOption = {
  id: string;
  name: string;
  postingPolicy: SpacePostingPolicy;
};

type NewThreadDialogContextValue = {
  openNewThread: (categoryId?: string) => void;
  hasSpaces: boolean;
};

export const NewThreadDialogContext = createContext<NewThreadDialogContextValue | null>(null);

export function NewThreadDialogProvider({
  children,
  isAuthenticated,
  viewerRole,
  categories,
  uploadsEnabled,
}: {
  children: React.ReactNode;
  isAuthenticated: boolean;
  viewerRole: ForumRole | null;
  categories: CategoryOption[];
  uploadsEnabled: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const pathname = usePathname();
  const router = useRouter();
  const titleId = useId();
  const descriptionId = useId();
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [draftKey, setDraftKey] = useState(0);
  const [titleLength, setTitleLength] = useState(0);
  const [tagValue, setTagValue] = useState("");
  const selectableCategories = useMemo(
    () => isAuthenticated
      ? categories.filter((category) => canStartDiscussion(viewerRole, category.postingPolicy))
      : categories,
    [categories, isAuthenticated, viewerRole],
  );

  const resetDraft = useCallback(() => {
    formRef.current?.reset();
    setSelectedCategoryId("");
    setTitleLength(0);
    setTagValue("");
    setDraftKey((current) => current + 1);
  }, []);

  const closeDialog = useCallback(() => {
    if (dialogRef.current?.open) dialogRef.current.close();
  }, []);

  const openNewThread = useCallback((categoryId?: string) => {
    if (!isAuthenticated) {
      router.push("/sign-in");
      return;
    }

    const nextCategoryId = categoryId && selectableCategories.some((category) => category.id === categoryId) ? categoryId : "";
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    flushSync(() => setSelectedCategoryId(nextCategoryId));
    dialogRef.current?.showModal();
    titleRef.current?.focus();
  }, [isAuthenticated, router, selectableCategories]);

  useEffect(() => {
    closeDialog();
  }, [closeDialog, pathname]);

  const tagPreview = useMemo(() => {
    return [...new Set(
      tagValue
        .split(",")
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean),
    )].slice(0, 5);
  }, [tagValue]);

  return (
    <NewThreadDialogContext.Provider
      value={{
        openNewThread,
        hasSpaces: isAuthenticated ? selectableCategories.length > 0 : categories.length > 0,
      }}
    >
      {children}
      {isAuthenticated ? (
        <dialog
          ref={dialogRef}
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          className="card m-auto max-h-[calc(100dvh-1.5rem)] w-[calc(100%-1rem)] max-w-2xl overflow-y-auto p-0 text-[var(--foreground)] shadow-2xl backdrop:bg-black/60 backdrop:backdrop-blur-sm"
          onCancel={(event) => {
            event.preventDefault();
            closeDialog();
          }}
          onClose={() => {
            resetDraft();
            const opener = openerRef.current;
            openerRef.current = null;
            if (opener?.isConnected) opener.focus();
          }}
        >
          <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b bg-[var(--surface)] px-5 py-4 sm:px-7" style={{ borderColor: "var(--line)" }}>
            <div>
              <div className="eyebrow">Share with the community</div>
              <h2 id={titleId} className="mt-1 text-xl font-black tracking-tight sm:text-2xl">Start a discussion</h2>
              <p id={descriptionId} className="mt-1.5 max-w-xl text-sm leading-6 muted">A clear title and a little context help others give you a useful answer.</p>
            </div>
            <button
              type="button"
              className="button button-ghost !h-9 !w-9 shrink-0 !p-0"
              aria-label="Close new thread dialog"
              onClick={closeDialog}
            >
              <X aria-hidden="true" size={18} />
            </button>
          </div>

          <RateLimitForm key={draftKey} ref={formRef} action={createThread} className="space-y-5 px-5 py-5 sm:px-7 sm:py-6">
            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <label className="label !mb-0" htmlFor="new-thread-title">Title</label>
                <span className="text-xs font-semibold tabular-nums" style={{ color: titleLength >= 160 ? "var(--danger)" : "var(--muted)" }}>{titleLength}/160</span>
              </div>
              <input
                ref={titleRef}
                className="input"
                id="new-thread-title"
                name="title"
                minLength={5}
                maxLength={160}
                placeholder="What would you like to discuss?"
                required
                onChange={(e) => setTitleLength(e.target.value.length)}
                aria-describedby="new-thread-title-hint"
              />
              <p id="new-thread-title-hint" className="hint">Be specific — 5 to 160 characters. Good titles get better replies.</p>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="new-thread-category">Space</label>
                <select
                  className="input"
                  id="new-thread-category"
                  name="categoryId"
                  value={selectedCategoryId}
                  onChange={(event) => setSelectedCategoryId(event.target.value)}
                  required
                  aria-describedby="new-thread-category-hint"
                >
                  <option value="">Choose a space</option>
                  {selectableCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
                <p id="new-thread-category-hint" className="hint">Pick where this discussion lives.</p>
              </div>

              <div>
                <label className="label" htmlFor="new-thread-tags">Tags <span className="font-normal muted">(up to 5, comma-separated)</span></label>
                <input
                  className="input"
                  id="new-thread-tags"
                  name="tags"
                  maxLength={180}
                  placeholder="api, showcase, question"
                  value={tagValue}
                  onChange={(e) => setTagValue(e.target.value)}
                  aria-describedby="new-thread-tags-hint"
                />
                <p id="new-thread-tags-hint" className="hint">
                  {tagPreview.length ? `${tagPreview.length}/5 tags` : "Add tags to help others find your post."}
                </p>
                {tagPreview.length ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {tagPreview.map((tag) => (
                      <span key={tag} className="pill pill-strong">#{tag}</span>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            <div>
              <label className="label" htmlFor="new-thread-body">Post</label>
              <MarkdownEditorClient
                key={draftKey}
                id="new-thread-body"
                rows={10}
                placeholder="Add context, code, links, or images… Markdown and @mentions supported."
                uploadsEnabled={uploadsEnabled}
              />
              <p className="hint">You can edit or delete your discussion after publishing. Be kind and stay on topic.</p>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-5" style={{ borderColor: "var(--line)" }}>
              <p className="text-xs leading-5 muted">By publishing, you agree to follow community guidelines.</p>
              <SubmitButton pendingLabel="Publishing…">Publish discussion <ArrowRight size={16} aria-hidden /></SubmitButton>
            </div>
          </RateLimitForm>
        </dialog>
      ) : null}
    </NewThreadDialogContext.Provider>
  );
}
