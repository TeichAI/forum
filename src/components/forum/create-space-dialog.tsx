"use client";

import { useActionState, useId, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { createSpace, type SpaceActionState } from "@/actions/spaces";
import { FieldMessage } from "@/components/auth/auth-controls";
import { SubmitButton } from "@/components/ui/submit-button";

const initialState = { status: "idle" } satisfies SpaceActionState;

function CreateSpaceForm() {
  const [state, action] = useActionState(createSpace, initialState);

  return (
    <form action={action} className="mt-6 space-y-5" noValidate>
      {state.message && (
        <div
          className="rounded-xl border px-3.5 py-3 text-sm"
          style={{
            borderColor: "color-mix(in srgb, var(--danger) 28%, var(--line))",
            background: "color-mix(in srgb, var(--danger) 8%, var(--surface))",
            color: "var(--danger)",
          }}
          role="alert"
        >
          {state.message}
        </div>
      )}
      <div>
        <label className="label" htmlFor="new-space-name">Name</label>
        <input
          className="input"
          id="new-space-name"
          name="name"
          minLength={2}
          maxLength={60}
          placeholder="Product ideas"
          required
          aria-invalid={Boolean(state.fieldErrors?.name)}
          aria-describedby={state.fieldErrors?.name ? "new-space-name-error" : undefined}
        />
        <FieldMessage id="new-space-name-error">{state.fieldErrors?.name}</FieldMessage>
      </div>
      <div>
        <label className="label" htmlFor="new-space-description">Description</label>
        <textarea
          className="input"
          id="new-space-description"
          name="description"
          rows={4}
          minLength={2}
          maxLength={280}
          placeholder="What should members discuss here?"
          required
          aria-invalid={Boolean(state.fieldErrors?.description)}
          aria-describedby={state.fieldErrors?.description ? "new-space-description-error" : undefined}
        />
        <FieldMessage id="new-space-description-error">{state.fieldErrors?.description}</FieldMessage>
      </div>
      <div>
        <label className="label" htmlFor="new-space-color">Color</label>
        <div className="flex items-center gap-3">
          <input
            className="h-11 w-16 cursor-pointer rounded-xl border bg-[var(--surface)] p-1"
            style={{ borderColor: "var(--line)" }}
            id="new-space-color"
            name="color"
            type="color"
            defaultValue="#0f766e"
            aria-invalid={Boolean(state.fieldErrors?.color)}
            aria-describedby={state.fieldErrors?.color ? "new-space-color-error" : "new-space-color-help"}
          />
          <p id="new-space-color-help" className="text-sm muted">Used to identify the space throughout the forum.</p>
        </div>
        <FieldMessage id="new-space-color-error">{state.fieldErrors?.color}</FieldMessage>
      </div>
      <div className="flex justify-end">
        <SubmitButton pendingLabel="Creating…">Create space</SubmitButton>
      </div>
    </form>
  );
}

export function CreateSpaceDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const [draftKey, setDraftKey] = useState(0);

  function openDialog() {
    dialogRef.current?.showModal();
    requestAnimationFrame(() => document.getElementById("new-space-name")?.focus());
  }

  function closeDialog() {
    dialogRef.current?.close();
  }

  return (
    <>
      <button ref={triggerRef} type="button" className="button button-ghost !px-2 !py-1 text-xs" onClick={openDialog}>
        <Plus size={14} aria-hidden="true" /> Add space
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="card m-auto max-h-[calc(100dvh-1.5rem)] w-[calc(100%-1.5rem)] max-w-lg overflow-y-auto p-0 text-[var(--foreground)] shadow-2xl backdrop:bg-black/55"
        onCancel={(event) => {
          event.preventDefault();
          closeDialog();
        }}
        onClose={() => {
          setDraftKey((current) => current + 1);
          triggerRef.current?.focus();
        }}
      >
        <div className="p-5 sm:p-7">
          <div className="flex items-start justify-between gap-5">
            <div>
              <div className="eyebrow">Admin tools</div>
              <h2 id={titleId} className="mt-1 text-2xl font-black">Create a space</h2>
              <p id={descriptionId} className="mt-2 text-sm leading-6 muted">Spaces organize discussions around a shared topic.</p>
            </div>
            <button type="button" className="button button-ghost !h-10 !w-10 shrink-0 !p-0" aria-label="Close create space dialog" onClick={closeDialog}>
              <X aria-hidden="true" size={20} />
            </button>
          </div>
          <CreateSpaceForm key={draftKey} />
        </div>
      </dialog>
    </>
  );
}
