"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bold, ImagePlus, Italic, Link as LinkIcon, List, ListOrdered, LoaderCircle, Quote, X } from "lucide-react";
import { deleteMailDraft, saveMailDraft, searchMailRecipients, sendMail, type MailActionState, type MailRecipientOption, type MailUserRecipient } from "@/actions/mail";
import { Avatar } from "@/components/ui/avatar";
import { UserRoleBadge } from "@/components/ui/user-role-badge";
import { UploadButton } from "@/lib/uploadthing";

type Recipient = MailRecipientOption;
type Draft = { id: string; threadId: string | null; subject: string; body: string; staffMailbox: boolean; recipients: MailUserRecipient[] };

const staffMailboxRecipient: Recipient = { kind: "staff-mailbox", id: "staff-mailbox", displayName: "Staff Mailbox", username: "staff", imageUrl: null, role: "STAFF_MAILBOX" };

const idle: MailActionState = { status: "idle" };

export function MailComposer({ role, initialRecipients = [], draft, uploadsEnabled }: { role: string; initialRecipients?: MailUserRecipient[]; draft?: Draft; uploadsEnabled: boolean }) {
  const router = useRouter();
  const maxRecipients = role === "MODERATOR" || role === "ADMIN" ? 25 : 1;
  const [recipients, setRecipients] = useState<Recipient[]>(draft?.staffMailbox ? [staffMailboxRecipient] : draft?.recipients ?? initialRecipients);
  const [subject, setSubject] = useState(draft?.subject ?? "");
  const [body, setBody] = useState(draft?.body ?? "");
  const [draftId, setDraftId] = useState(draft?.id);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Recipient[]>([]);
  const [searchState, setSearchState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeResult, setActiveResult] = useState(-1);
  const [saveState, setSaveState] = useState<MailActionState>(draft ? { status: "saved", message: "Draft saved" } : idle);
  const draftIdRef = useRef(draft?.id);
  const draftSaveRef = useRef<Promise<MailActionState> | null>(null);
  const currentRef = useRef({ recipients, subject, body });
  currentRef.current = { recipients, subject, body };
  const [sendState, sendAction, sending] = useActionState<MailActionState, FormData>(async (_state, data) => {
    if (draftSaveRef.current) await draftSaveRef.current;
    if (draftIdRef.current) data.set("draftId", draftIdRef.current);
    return await sendMail(data);
  }, idle);
  const [, startTransition] = useTransition();
  const textarea = useRef<HTMLTextAreaElement>(null);
  const recipientInput = useRef<HTMLInputElement>(null);
  const searchRequest = useRef(0);
  const lastSaved = useRef(JSON.stringify({ recipients: recipients.map((item) => item.id), subject, body }));
  const current = JSON.stringify({ recipients: recipients.map((item) => item.id), subject, body });
  const canSearch = recipients.length < maxRecipients;
  const normalizedQuery = query.trim();
  const searchableQuery = normalizedQuery.length === 0 || normalizedQuery.length >= 2;
  const showSearch = canSearch && searchOpen && searchableQuery;

  useEffect(() => {
    const request = ++searchRequest.current;
    if (!searchOpen || !searchableQuery || !canSearch) return;
    const timer = window.setTimeout(() => {
      void searchMailRecipients(normalizedQuery)
        .then((items) => {
          if (searchRequest.current !== request) return;
          setResults(items.filter((item) => !recipients.some((selected) => selected.id === item.id)));
          setSearchState("success");
        })
        .catch(() => {
          if (searchRequest.current !== request) return;
          setResults([]);
          setSearchState("error");
        });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [normalizedQuery, recipients, canSearch, searchOpen, searchableQuery]);

  useEffect(() => {
    if (current === lastSaved.current || (!subject && !body && !recipients.length)) return;
    setSaveState({ status: "idle", message: "Unsaved changes" });
    const timer = window.setTimeout(() => {
      startTransition(() => {
        void saveDraft();
      });
    }, 1_000);
    return () => window.clearTimeout(timer);
    // makeDraftData only reads the dependencies represented by current and draft.threadId.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, draft?.threadId]);

  function makeDraftData(values = currentRef.current) {
    const data = new FormData();
    if (draftIdRef.current) data.set("draftId", draftIdRef.current);
    if (draft?.threadId) data.set("threadId", draft.threadId);
    data.set("subject", values.subject);
    data.set("body", values.body);
    values.recipients.forEach((recipient) => recipient.kind === "staff-mailbox" ? data.set("staffMailbox", "true") : data.append("recipientId", recipient.id));
    return data;
  }

  function saveDraft() {
    const previous = draftSaveRef.current;
    const request = (async (): Promise<MailActionState> => {
      if (previous) await previous;
      const values = currentRef.current;
      const snapshot = JSON.stringify({ recipients: values.recipients.map((item) => item.id), subject: values.subject, body: values.body });
      if (draftIdRef.current && snapshot === lastSaved.current) {
        return { status: "saved", message: "Draft saved", draftId: draftIdRef.current };
      }
      try {
        const state = await saveMailDraft(makeDraftData(values));
        if (state.status === "saved") lastSaved.current = snapshot;
        return state;
      } catch {
        return { status: "error", message: "We couldn’t save this draft." };
      }
    })();
    draftSaveRef.current = request;
    void request.then((state) => {
      setSaveState(state);
      if (state.status === "saved") {
        draftIdRef.current = state.draftId;
        setDraftId(state.draftId);
      }
    }).finally(() => {
      if (draftSaveRef.current === request) draftSaveRef.current = null;
    });
    return request;
  }

  function wrap(before: string, after = before, placeholder = "text") {
    const input = textarea.current;
    if (!input) return;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const selected = body.slice(start, end) || placeholder;
    const next = `${body.slice(0, start)}${before}${selected}${after}${body.slice(end)}`;
    setBody(next);
    requestAnimationFrame(() => { input.focus(); input.setSelectionRange(start + before.length, start + before.length + selected.length); });
  }

  async function saveAndClose() {
    setSaveState({ status: "idle", message: "Saving…" });
    if (draftSaveRef.current) await draftSaveRef.current;
    const state = await saveDraft();
    setSaveState(state);
    if (state.status === "saved") router.push("/mail?folder=drafts");
  }

  async function discard() {
    if (draftSaveRef.current) await draftSaveRef.current;
    if (draftIdRef.current) {
      const data = new FormData(); data.set("draftId", draftIdRef.current);
      await deleteMailDraft(data);
    }
    router.push("/mail");
  }

  function selectRecipient(recipient: Recipient) {
    searchRequest.current += 1;
    setRecipients((items) => items.some((item) => item.id === recipient.id) ? items : [...items, recipient]);
    setQuery("");
    setResults([]);
    setSearchState("idle");
    setSearchOpen(false);
    setActiveResult(-1);
    requestAnimationFrame(() => recipientInput.current?.focus());
  }

  function updateRecipientQuery(value: string) {
    const length = value.trim().length;
    const searchable = length === 0 || length >= 2;
    searchRequest.current += 1;
    setQuery(value);
    setResults([]);
    setSearchState(searchable ? "loading" : "idle");
    setSearchOpen(searchable);
    setActiveResult(-1);
  }

  function removeRecipient(recipientId: string) {
    searchRequest.current += 1;
    setRecipients((items) => items.filter((item) => item.id !== recipientId));
    setResults([]);
    setSearchState(normalizedQuery.length === 0 || normalizedQuery.length >= 2 ? "loading" : "idle");
    setActiveResult(-1);
  }

  function handleRecipientKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape" && showSearch) {
      event.preventDefault();
      setSearchOpen(false);
      setActiveResult(-1);
      return;
    }

    if (!showSearch || searchState !== "success" || !results.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveResult((index) => index < results.length - 1 ? index + 1 : 0);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveResult((index) => index > 0 ? index - 1 : results.length - 1);
    } else if (event.key === "Enter" && activeResult >= 0) {
      event.preventDefault();
      selectRecipient(results[activeResult]!);
    }
  }

  return <form action={sendAction} className="mail-compose-form" aria-busy={sending}>
    {draftId && <input type="hidden" name="draftId" value={draftId} />}
    {recipients.map((recipient) => recipient.kind === "staff-mailbox" ? <input type="hidden" name="staffMailbox" value="true" key={recipient.id} /> : <input type="hidden" name="recipientId" value={recipient.id} key={recipient.id} />)}
    <header className="flex items-center justify-between gap-3 border-b px-4 py-3 sm:px-6" style={{ borderColor: "var(--line)" }}><div><div className="eyebrow">Teich Mail</div><h1 className="mt-1 text-xl font-black">New mail</h1></div><button type="button" className="button button-ghost !h-9 !w-9 !p-0" onClick={() => router.push("/mail")} aria-label="Close compose"><X size={17} /></button></header>
    <div
      className="relative border-b px-4 py-3 sm:px-6"
      style={{ borderColor: "var(--line)" }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setSearchOpen(false);
          setActiveResult(-1);
        }
      }}
    >
      <label className="label" htmlFor="mail-recipient-search">To</label>
      <div className="flex flex-wrap items-center gap-2">
        {recipients.map((recipient) => <span className="pill pill-strong" key={recipient.id}>{recipient.displayName} {recipient.kind === "user" && <span className="muted">@{recipient.username}</span>}<button type="button" onClick={() => removeRecipient(recipient.id)} aria-label={`Remove ${recipient.displayName}`}><X size={12} /></button></span>)}
        {canSearch && <input
          ref={recipientInput}
          id="mail-recipient-search"
          className="min-w-48 flex-1 bg-transparent py-1 text-sm outline-none"
          value={query}
          onChange={(event) => updateRecipientQuery(event.target.value)}
          onFocus={() => {
            if (searchableQuery) {
              setSearchState("loading");
              setSearchOpen(true);
            }
          }}
          onKeyDown={handleRecipientKeyDown}
          placeholder={recipients.length ? "Add another recipient" : "Search name or @username"}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          role="combobox"
          aria-autocomplete="list"
          aria-haspopup="listbox"
          aria-expanded={showSearch}
          aria-controls="mail-recipient-results"
          aria-activedescendant={showSearch && activeResult >= 0 ? `mail-recipient-option-${results[activeResult]?.id}` : undefined}
        />}
      </div>
      {maxRecipients > 1 && <p className="hint">Staff BCC: each of up to 25 recipients receives an independent private thread.</p>}
      {showSearch && <div className="card absolute left-4 right-4 z-30 mt-2 max-h-80 overflow-hidden shadow-xl sm:left-6 sm:right-auto sm:w-[28rem]">
        <p className="flex min-h-10 items-center gap-2 border-b px-4 py-2 text-xs font-semibold muted" style={{ borderColor: "var(--line)" }} role="status" aria-live="polite">
          {searchState === "loading" && <><LoaderCircle className="animate-spin" size={14} aria-hidden="true" />Loading recipients…</>}
          {searchState === "error" && "We couldn’t load recipients. Try again."}
          {searchState === "success" && (results.length ? `${results.length} ${results.length === 1 ? "recipient" : "recipients"} available` : "No recipients found.")}
        </p>
        <div id="mail-recipient-results" role="listbox" aria-label="Recipient suggestions" className="max-h-64 overflow-y-auto overscroll-contain">
          {results.map((result, index) => <button
            id={`mail-recipient-option-${result.id}`}
            className="flex w-full items-center gap-3 border-b px-4 py-3 text-left text-sm last:border-0 hover:bg-[var(--surface-soft)] focus-visible:outline-none"
            style={{ borderColor: "var(--line)", background: activeResult === index ? "var(--surface-soft)" : undefined }}
            type="button"
            role="option"
            aria-selected={activeResult === index}
            key={result.id}
            onMouseDown={(event) => event.preventDefault()}
            onMouseEnter={() => setActiveResult(index)}
            onClick={() => selectRecipient(result)}
          >
            <Avatar src={result.imageUrl} name={result.displayName} className="!h-9 !w-9 shrink-0" />
            <span className="min-w-0 flex-1"><strong className="block truncate">{result.displayName}</strong><span className="block truncate text-xs muted">{result.kind === "staff-mailbox" ? "Shared inbox for moderators and administrators" : `@${result.username}`}</span></span>
            {(result.role === "MODERATOR" || result.role === "ADMIN") && <UserRoleBadge role={result.role} />}
          </button>)}
        </div>
      </div>}
      {sendState.status === "error" && sendState.fieldErrors?.recipients && <p className="hint hint-error">{sendState.message}</p>}
    </div>
    <div className="border-b px-4 py-3 sm:px-6" style={{ borderColor: "var(--line)" }}><label className="sr-only" htmlFor="mail-subject">Subject</label><input id="mail-subject" className="w-full bg-transparent text-lg font-bold outline-none placeholder:font-normal" name="subject" value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={160} placeholder="Subject" required />{sendState.status === "error" && sendState.fieldErrors?.subject && <p className="hint hint-error">{sendState.fieldErrors.subject}</p>}</div>
    <div className="flex min-h-0 flex-1 flex-col p-4 sm:p-6"><div className="mb-2 flex flex-wrap gap-1" role="toolbar" aria-label="Mail formatting"><FormatButton label="Bold" onClick={() => wrap("**")}><Bold size={15} /></FormatButton><FormatButton label="Italic" onClick={() => wrap("*")}><Italic size={15} /></FormatButton><FormatButton label="Link" onClick={() => wrap("[", "](https://)", "link text")}><LinkIcon size={15} /></FormatButton><FormatButton label="Bulleted list" onClick={() => wrap("- ", "", "list item")}><List size={15} /></FormatButton><FormatButton label="Numbered list" onClick={() => wrap("1. ", "", "list item")}><ListOrdered size={15} /></FormatButton><FormatButton label="Quote" onClick={() => wrap("> ", "", "quote")}><Quote size={15} /></FormatButton>{uploadsEnabled && <UploadButton endpoint="mailImageUploader" appearance={{ button: "button button-ghost !h-8 !px-2", allowedContent: "hidden" }} content={{ button: <><ImagePlus size={15} /><span className="sr-only">Add inline image</span></> }} onClientUploadComplete={(files) => { const file = files[0]; if (file?.serverData?.url) setBody((value) => `${value}${value ? "\n\n" : ""}![${file.name}](${file.serverData.url})`); }} />}</div><textarea ref={textarea} className="min-h-64 flex-1 resize-none bg-transparent text-[0.95rem] leading-7 outline-none" name="body" value={body} onChange={(event) => setBody(event.target.value)} maxLength={50_000} placeholder="Write your mail…" aria-label="Mail body" required /><div className="mt-2 flex justify-between text-xs muted"><span>Markdown formatting · images are inline</span><span>{body.length.toLocaleString()} / 50,000</span></div>{sendState.status === "error" && <p className="mt-2 text-sm font-semibold" style={{ color: "var(--danger)" }} role="alert">{sendState.message}</p>}{sendState.status === "rate_limited" && <p className="mt-2 text-sm font-semibold" style={{ color: "var(--danger)" }} role="alert">{sendState.message}</p>}</div>
    <footer className="flex flex-wrap items-center gap-2 border-t px-4 py-3 sm:px-6" style={{ borderColor: "var(--line)" }}><button type="submit" className="button button-primary" disabled={sending || !recipients.length || !subject.trim() || !body.trim()}>{sending ? "Sending…" : recipients.length > 1 ? `Send ${recipients.length} private copies` : "Send mail"}</button><button type="button" className="button button-secondary" onClick={() => void saveAndClose()}>Save & close</button><button type="button" className="button button-ghost" onClick={() => void discard()}>Discard</button><span className="ml-auto text-xs muted" role="status">{saveState.status === "saved" ? "Draft saved" : saveState.status === "error" || saveState.status === "rate_limited" ? saveState.message : saveState.message ?? "Autosaves after 1 second"}</span></footer>
  </form>;
}

function FormatButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" className="button button-ghost !h-8 !w-8 !p-0" onClick={onClick} aria-label={label} title={label}>{children}</button>;
}
