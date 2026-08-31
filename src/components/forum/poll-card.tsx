"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { voteInPoll, type PollActionState } from "@/actions/forum";
import { RateLimitCountdown, useRateLimitCooldown } from "@/components/rate-limit-countdown";
import type { PollSnapshot } from "@/lib/polls";

const FALLBACK_POLL_MS = 60_000;
const MAX_TIMEOUT_MS = 2_147_000_000;

function closingLabel(expiresAt: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(expiresAt));
}

export function PollCard({ initialPoll, canVote }: { initialPoll: PollSnapshot; canVote: boolean }) {
  const [poll, setPoll] = useState(initialPoll);
  const [selection, setSelection] = useState(initialPoll.selectedOptionId);
  const [actionState, setActionState] = useState<PollActionState>({ status: "idle" });
  const [pending, setPending] = useState(false);
  const [streamUnavailable, setStreamUnavailable] = useState(false);
  const pollRef = useRef(poll);
  const mounted = useRef(true);
  const refreshInFlight = useRef<Promise<PollSnapshot | null> | null>(null);
  const refreshQueued = useRef(false);
  const controllers = useRef(new Set<AbortController>());
  const rateState = actionState.status === "rate_limited" ? actionState : null;
  const { coolingDown, onReady } = useRateLimitCooldown(rateState);

  useEffect(() => { pollRef.current = poll; }, [poll]);

  const applySnapshot = useCallback((next: PollSnapshot) => {
    if (!mounted.current) return;
    setPoll(next);
    setSelection(next.selectedOptionId);
  }, []);

  const refreshPoll = useCallback(() => {
    if (refreshInFlight.current) {
      refreshQueued.current = true;
      return refreshInFlight.current;
    }
    const run = async () => {
      let latest: PollSnapshot | null = null;
      do {
        refreshQueued.current = false;
        const controller = new AbortController();
        controllers.current.add(controller);
        try {
          const response = await fetch(`/api/polls/${encodeURIComponent(pollRef.current.id)}`, { cache: "no-store", signal: controller.signal });
          if (response.ok) {
            latest = await response.json() as PollSnapshot;
            applySnapshot(latest);
          }
        } catch {
          // Keep the latest valid results while the network recovers.
        } finally {
          controllers.current.delete(controller);
        }
      } while (refreshQueued.current && mounted.current);
      return latest;
    };
    const promise = run().finally(() => { refreshInFlight.current = null; });
    refreshInFlight.current = promise;
    return promise;
  }, [applySnapshot]);

  useEffect(() => {
    mounted.current = true;
    const activeControllers = controllers.current;
    return () => {
      mounted.current = false;
      for (const controller of activeControllers) controller.abort();
      activeControllers.clear();
    };
  }, []);

  useEffect(() => {
    if (poll.status === "CLOSED") return;
    if (typeof EventSource === "undefined") {
      const timer = window.setTimeout(() => setStreamUnavailable(true), 0);
      return () => window.clearTimeout(timer);
    }
    const events = new EventSource(`/api/polls/${encodeURIComponent(poll.id)}/events`);
    const reconcile = () => { setStreamUnavailable(false); void refreshPoll(); };
    const refresh = () => { void refreshPoll(); };
    events.onopen = reconcile;
    events.onerror = () => setStreamUnavailable(true);
    events.addEventListener("refresh", refresh);
    return () => {
      events.removeEventListener("refresh", refresh);
      events.close();
    };
  }, [poll.id, poll.status, refreshPoll]);

  useEffect(() => {
    if (poll.status === "CLOSED" || !streamUnavailable) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "hidden" && navigator.onLine) void refreshPoll();
    }, FALLBACK_POLL_MS);
    return () => window.clearInterval(timer);
  }, [poll.status, refreshPoll, streamUnavailable]);

  useEffect(() => {
    if (poll.status === "CLOSED") return;
    const recover = () => {
      if (document.visibilityState !== "hidden" && navigator.onLine) void refreshPoll();
    };
    document.addEventListener("visibilitychange", recover);
    window.addEventListener("focus", recover);
    window.addEventListener("online", recover);
    return () => {
      document.removeEventListener("visibilitychange", recover);
      window.removeEventListener("focus", recover);
      window.removeEventListener("online", recover);
    };
  }, [poll.status, refreshPoll]);

  useEffect(() => {
    if (poll.status === "CLOSED") return;
    let timer: number | undefined;
    const closeAtExpiration = () => {
      const remaining = new Date(poll.expiresAt).getTime() - Date.now();
      if (remaining <= 0) {
        setPoll((current) => ({ ...current, status: "CLOSED" }));
        void refreshPoll();
        return;
      }
      timer = window.setTimeout(closeAtExpiration, Math.min(remaining, MAX_TIMEOUT_MS));
    };
    closeAtExpiration();
    return () => { if (timer) window.clearTimeout(timer); };
  }, [poll.expiresAt, poll.status, refreshPoll]);

  const recordVote = async (optionId: string) => {
    if (pending || coolingDown || poll.status === "CLOSED" || optionId === poll.selectedOptionId) return;
    const committedSelection = poll.selectedOptionId;
    setSelection(optionId);
    setPending(true);
    setActionState({ status: "idle" });
    const formData = new FormData();
    formData.set("pollId", poll.id);
    formData.set("optionId", optionId);
    try {
      const next = await voteInPoll({ status: "idle" }, formData);
      if (!mounted.current) return;
      setActionState(next);
      if (next.status === "success") applySnapshot(next.poll);
      else setSelection(committedSelection);
    } catch {
      if (!mounted.current) return;
      setSelection(committedSelection);
      setActionState({ status: "error", message: "We couldn’t record your vote. Please try again." });
    } finally {
      if (mounted.current) setPending(false);
    }
  };

  const closed = poll.status === "CLOSED";
  const interactive = canVote && !closed;
  return (
    <section className="border-t p-4 sm:p-6" style={{ borderColor: "var(--line)" }} aria-labelledby={`poll-${poll.id}-question`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="eyebrow">Community poll</div>
        <span className={`pill ${closed ? "" : "pill-strong"}`} aria-label={closed ? "Poll closed" : "Poll active"}>
          {!closed ? <span className="h-1.5 w-1.5 rounded-full bg-current motion-safe:animate-pulse" aria-hidden /> : null}
          {closed ? "Closed" : "Live"}
        </span>
      </div>
      <h2 id={`poll-${poll.id}-question`} className="mt-2 text-lg font-black sm:text-xl">{poll.question}</h2>
      <p className="mt-1 text-xs muted">
        {closed ? "Final results" : `Closes ${closingLabel(poll.expiresAt)}`} · {poll.totalVotes} {poll.totalVotes === 1 ? "vote" : "votes"}
      </p>

      <div className="mt-4 overflow-hidden rounded-xl border" style={{ borderColor: "var(--line)" }} role={interactive ? "radiogroup" : undefined} aria-label={interactive ? "Poll choices" : undefined} aria-busy={pending || undefined}>
        {poll.options.map((option, index) => {
          const selected = selection === option.id;
          const committed = poll.selectedOptionId === option.id;
          const content = (
            <>
              <span className="absolute inset-y-0 left-0 bg-[color-mix(in_srgb,var(--brand)_12%,transparent)] transition-[width]" style={{ width: `${option.percentage}%` }} role="progressbar" aria-label={`${option.text}: ${option.percentage}%`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={option.percentage} />
              <span className="relative flex min-w-0 flex-1 items-center gap-2">
                {interactive ? <input type="radio" name={`poll-${poll.id}`} value={option.id} checked={selected} onChange={() => void recordVote(option.id)} disabled={pending || coolingDown} /> : null}
                <span className="min-w-0 font-bold">{option.text}</span>
                {committed ? <span className="pill ml-1 shrink-0 !px-1.5 !py-0.5">Your vote</span> : null}
              </span>
              <span className="relative ml-3 shrink-0 text-right text-xs muted">
                <span className="font-bold text-[var(--muted-strong)]">{option.voteCount}</span>
                <span className="ml-2 inline-block w-9 tabular-nums">{option.percentage}%</span>
              </span>
            </>
          );
          const rowClass = `relative flex min-h-12 w-full items-center overflow-hidden px-3 py-2.5 text-left text-sm ${index ? "border-t" : ""}`;
          return interactive ? (
            <label key={option.id} className={`${rowClass} cursor-pointer hover:bg-[var(--surface-soft)]`} style={{ borderColor: "var(--line)" }}>{content}</label>
          ) : (
            <div key={option.id} className={rowClass} style={{ borderColor: "var(--line)" }}>{content}</div>
          );
        })}
      </div>

      <div className="mt-2 min-h-5 text-xs font-semibold">
        {pending ? <p className="muted">Saving vote…</p> : null}
        {!canVote && !closed ? <p className="muted"><Link className="font-bold underline" href="/sign-in">Sign in</Link> to vote.</p> : null}
        {actionState.message ? <p style={{ color: actionState.status === "success" ? "var(--success)" : "var(--danger)" }} role={actionState.status === "success" ? "status" : "alert"} aria-live="polite">{actionState.message}</p> : null}
        {rateState ? <RateLimitCountdown trigger={rateState} onReady={onReady} className="text-xs font-semibold" /> : null}
        {streamUnavailable && !closed ? <p className="muted" aria-hidden="true">Reconnecting…</p> : null}
      </div>
    </section>
  );
}
