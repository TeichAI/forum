"use client";

import { useEffect, useRef, useTransition } from "react";
import { setMailReadState } from "@/actions/mail";

export function MailReadReceipt({ threadId, unread }: { threadId: string; unread: boolean }) {
  const sent = useRef(false);
  const [, startTransition] = useTransition();
  useEffect(() => {
    if (!unread || sent.current) return;
    sent.current = true;
    const data = new FormData();
    data.set("threadId", threadId);
    data.set("unread", "false");
    startTransition(() => { void setMailReadState(data); });
  }, [threadId, unread]);
  return null;
}
