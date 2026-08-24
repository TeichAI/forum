"use client";

import { useId, useRef } from "react";
import { X } from "lucide-react";

export function EditorDialog({ title, children }: { title: string; children: React.ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  function openDialog() {
    dialogRef.current?.showModal();
  }

  function closeDialog() {
    dialogRef.current?.close();
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="cursor-pointer border-0 bg-transparent p-0 text-xs font-semibold muted"
        aria-haspopup="dialog"
        onClick={openDialog}
      >
        Edit
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        className="card m-auto max-h-[calc(100vh-2rem)] w-[calc(100%-1.5rem)] max-w-2xl overflow-y-auto p-0 text-[var(--foreground)] shadow-2xl backdrop:bg-black/50"
        onCancel={(event) => {
          event.preventDefault();
          closeDialog();
        }}
        onClose={() => triggerRef.current?.focus()}
      >
        <div className="p-5 sm:p-7">
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 id={titleId} className="text-xl font-black">{title}</h2>
            <button
              type="button"
              className="button button-ghost !h-10 !w-10 shrink-0 !p-0"
              aria-label="Close edit dialog"
              onClick={closeDialog}
            >
              <X aria-hidden="true" size={20} />
            </button>
          </div>
          {children}
        </div>
      </dialog>
    </>
  );
}
