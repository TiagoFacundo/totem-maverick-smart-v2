import { TAP_ID, TOTEM_ID, createSessionId } from "../../../shared/totem";

const PENDING_FINISHED_KEY = "maverick.pending-finished";

type JsonRecord = Record<string, unknown>;

function wait(ms: number) {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

function headers(idempotencyKey: string) {
  return {
    "Content-Type": "application/json",
    "X-Totem-ID": TOTEM_ID,
    "Idempotency-Key": idempotencyKey,
  };
}

async function requestWithRetry<T>(path: string, init: RequestInit = {}, retries = 4): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      const response = await fetch(path, { ...init, signal: AbortSignal.timeout(5000) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String((body as JsonRecord).message ?? `Erro HTTP ${response.status}`));
      return body as T;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Falha de comunicação");
      if (attempt < retries - 1) await wait(2 ** attempt * 2000);
    }
  }
  throw lastError ?? new Error("Falha de comunicação");
}

export type CommandResponse = {
  status: string;
  command: { type: string; session_id?: string; max_volume_ml?: number; max_value_cents?: number } | null;
};

export const tapApi = {
  newIdempotencyKey: () => createSessionId(),
  getCommand: () => requestWithRetry<CommandResponse>(`/api/public/tap/${TAP_ID}/command`, { headers: { "X-Totem-ID": TOTEM_ID } }, 1),
  getStatus: () => requestWithRetry<{ status: string }>(`/api/public/tap/${TAP_ID}/status`, { headers: { "X-Totem-ID": TOTEM_ID } }, 1),
  authorizeFace: (payload: JsonRecord) => requestWithRetry<{ authorized: boolean; reason?: string }>(`/api/public/tap/${TAP_ID}/authorize/face`, {
    method: "POST",
    headers: headers(createSessionId()),
    body: JSON.stringify({ tap_id: TAP_ID, totem_id: TOTEM_ID, ...payload }),
  }),
  authorizeQr: (payload: JsonRecord) => requestWithRetry<{ authorized: boolean; reason?: string }>(`/api/public/tap/${TAP_ID}/authorize/qr`, {
    method: "POST",
    headers: headers(createSessionId()),
    body: JSON.stringify({ tap_id: TAP_ID, totem_id: TOTEM_ID, ...payload }),
  }),
  open: (payload: JsonRecord, key: string) => requestWithRetry<{ accepted: boolean; status: string }>(`/api/public/tap/${TAP_ID}/open`, {
    method: "POST",
    headers: headers(key),
    body: JSON.stringify({ tap_id: TAP_ID, totem_id: TOTEM_ID, ...payload }),
  }),
  close: (sessionId: string, reason: string) => requestWithRetry(`/api/public/tap/${TAP_ID}/close`, {
    method: "POST",
    headers: headers(createSessionId()),
    body: JSON.stringify({ tap_id: TAP_ID, totem_id: TOTEM_ID, session_id: sessionId, command: "close", reason }),
  }),
  heartbeat: () => requestWithRetry(`/api/public/tap/${TAP_ID}/heartbeat`, {
    method: "POST",
    headers: headers(createSessionId()),
    body: JSON.stringify({ tap_id: TAP_ID, totem_id: TOTEM_ID, timestamp: Math.floor(Date.now() / 1000), status: "online" }),
  }),
  emergencyStop: () => requestWithRetry(`/api/public/tap/${TAP_ID}/emergency-stop`, {
    method: "POST",
    headers: headers(createSessionId()),
    body: JSON.stringify({ tap_id: TAP_ID, totem_id: TOTEM_ID, command: "emergency_stop", reason: "ui_safety_action" }),
  }),
  finished: (payload: JsonRecord, key: string) => requestWithRetry<{ received: boolean; status: string }>(`/api/public/tap/${TAP_ID}/finished`, {
    method: "POST",
    headers: headers(key),
    body: JSON.stringify({ tap_id: TAP_ID, totem_id: TOTEM_ID, ...payload }),
  }),
};

export function queuePendingFinished(payload: JsonRecord, key: string) {
  const pending = JSON.parse(localStorage.getItem(PENDING_FINISHED_KEY) ?? "[]") as Array<{ payload: JsonRecord; key: string }>;
  pending.push({ payload, key });
  localStorage.setItem(PENDING_FINISHED_KEY, JSON.stringify(pending.slice(-10)));
}

export async function flushPendingFinished() {
  const pending = JSON.parse(localStorage.getItem(PENDING_FINISHED_KEY) ?? "[]") as Array<{ payload: JsonRecord; key: string }>;
  if (!pending.length || !navigator.onLine) return;
  const remaining: typeof pending = [];
  for (const entry of pending) {
    try {
      await tapApi.finished(entry.payload, entry.key);
    } catch {
      remaining.push(entry);
    }
  }
  localStorage.setItem(PENDING_FINISHED_KEY, JSON.stringify(remaining));
}
