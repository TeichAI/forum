import "server-only";

import { Client, type Notification } from "pg";

const CHANNEL = "poll_vote_changed";
type PollListener = () => void;

const listeners = new Map<string, Set<PollListener>>();
let client: Client | null = null;
let connecting: Promise<Client> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function dispatch(message: Notification) {
  if (message.channel !== CHANNEL || !message.payload) return;
  for (const listener of listeners.get(message.payload) ?? []) listener();
}

function reset(current: Client) {
  if (client === current) client = null;
  connecting = null;
}

function reconnect(current: Client) {
  reset(current);
  if (reconnectTimer || !listeners.size) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void listenerClient().catch((error: unknown) => {
      console.error(JSON.stringify({ event: "poll_events.reconnect_failed", error: error instanceof Error ? error.name : "UnknownError" }));
      reconnect(current);
    });
  }, 1_000);
}

async function listenerClient() {
  if (client) return client;
  if (connecting) return connecting;
  connecting = (async () => {
    const next = new Client({ connectionString: process.env.DATABASE_URL });
    next.on("notification", dispatch);
    next.on("error", (error) => {
      console.error(JSON.stringify({ event: "poll_events.listener_error", error: error.name }));
      reconnect(next);
    });
    next.on("end", () => reconnect(next));
    await next.connect();
    await next.query(`LISTEN ${CHANNEL}`);
    client = next;
    return next;
  })();
  try {
    return await connecting;
  } catch (error) {
    connecting = null;
    throw error;
  }
}

export async function subscribeToPoll(pollId: string, listener: PollListener) {
  await listenerClient();
  const pollListeners = listeners.get(pollId) ?? new Set<PollListener>();
  pollListeners.add(listener);
  listeners.set(pollId, pollListeners);
  let subscribed = true;
  return () => {
    if (!subscribed) return;
    subscribed = false;
    pollListeners.delete(listener);
    if (!pollListeners.size) listeners.delete(pollId);
  };
}

export const POLL_EVENT_CHANNEL = CHANNEL;

export async function closePollEventListenerForTests() {
  const current = client;
  client = null;
  connecting = null;
  listeners.clear();
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;
  if (current) await current.end();
}
