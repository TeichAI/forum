"use client";

import { useContext, type ButtonHTMLAttributes } from "react";
import { NewThreadDialogContext } from "@/components/new-thread-dialog";

type NewThreadTriggerProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "type"> & {
  categoryId?: string;
};

export function NewThreadTrigger({ categoryId, children, ...props }: NewThreadTriggerProps) {
  const context = useContext(NewThreadDialogContext);
  if (!context) throw new Error("NewThreadTrigger must be rendered inside NewThreadDialogProvider");
  if (!context.hasSpaces) return null;

  return (
    <button type="button" {...props} onClick={() => context.openNewThread(categoryId)}>
      {children}
    </button>
  );
}
