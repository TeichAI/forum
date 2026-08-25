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
        className="button button-ghost button-sm !px-3"
        aria-haspopup="dialog"
        onClick={openDialog}
      >
        Edit
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        className="card m-auto max-h-[calc(100vh-2rem)] w-[calc(100%-1.5rem)] max-w-2xl overflow-y-auto p-0 text-[var(--foreground)] shadow-2xl backdrop:bg-black/60 backdrop:backdrop-blur-sm"
        onCancel={(event) => {
          event.preventDefault();
          closeDialog();
        }}
        onClose={() => triggerRef.current?.focus()}
      >
        <div className="px-5 py-5 sm:px-7 sm:py-6">
          <div className="mb-4 flex items-center justify-between gap-4 border-b pb-4" style={{ borderColor: "var(--line)" }}>
            <h2 id={titleId} className="text-lg font-black tracking-tight sm:text-xl">{title}</h2>
            <button
              type="button"
              className="button button-ghost !h-9 !w-9 shrink-0 !p-0"
              aria-label="Close edit dialog"
              onClick={closeDialog}
            >
              <X aria-hidden="true" size={18} />
            </button>
          </div>
          {children}
        </div>
      </dialog>
    </>
  );
}
