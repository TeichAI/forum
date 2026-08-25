"use client";

import type { SpacePostingPolicy } from "@prisma/client";
import { createContext, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { X } from "lucide-react";
import { createThread } from "@/actions/forum";
import { MarkdownEditorClient } from "@/components/markdown-editor-client";
import { SubmitButton } from "@/components/ui/submit-button";
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
  const selectableCategories = useMemo(
    () => isAuthenticated
      ? categories.filter((category) => canStartDiscussion(viewerRole, category.postingPolicy))
      : categories,
    [categories, isAuthenticated, viewerRole],
  );

  const resetDraft = useCallback(() => {
    formRef.current?.reset();
    setSelectedCategoryId("");
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
          className="card m-auto max-h-[calc(100dvh-1.5rem)] w-[calc(100%-1.5rem)] max-w-3xl overflow-y-auto p-0 text-[var(--foreground)] shadow-2xl backdrop:bg-black/55"
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
          <div className="p-5 sm:p-7">
            <div className="flex items-start justify-between gap-5">
              <div>
                <div className="eyebrow">Share with the community</div>
                <h2 id={titleId} className="mt-1 text-2xl font-black">Start a discussion</h2>
                <p id={descriptionId} className="mt-2 text-sm leading-6 muted">A specific title and a little context will help people give you a useful answer.</p>
              </div>
              <button
                type="button"
                className="button button-ghost !h-10 !w-10 shrink-0 !p-0"
                aria-label="Close new thread dialog"
                onClick={closeDialog}
              >
                <X aria-hidden="true" size={20} />
              </button>
            </div>
            <form key={draftKey} ref={formRef} action={createThread} className="mt-6 space-y-5">
              <div>
                <label className="label" htmlFor="new-thread-title">Title</label>
                <input
                  ref={titleRef}
                  className="input"
                  id="new-thread-title"
                  name="title"
                  minLength={5}
                  maxLength={160}
                  placeholder="What would you like to discuss?"
                  required
                />
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
                  >
                    <option value="">Choose a space</option>
                    {selectableCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="new-thread-tags">Tags <span className="font-normal muted">(up to 5)</span></label>
                  <input className="input" id="new-thread-tags" name="tags" maxLength={180} placeholder="api, showcase, question" />
                </div>
              </div>
              <div>
                <label className="label" htmlFor="new-thread-body">Post</label>
                <MarkdownEditorClient
                  key={draftKey}
                  id="new-thread-body"
                  rows={10}
                  placeholder="Add context, code, links, or images…"
                  uploadsEnabled={uploadsEnabled}
                />
              </div>
              <div className="flex justify-end">
                <SubmitButton pendingLabel="Publishing…">Publish discussion</SubmitButton>
              </div>
            </form>
          </div>
        </dialog>
      ) : null}
    </NewThreadDialogContext.Provider>
  );
}
