import type { Express, Request, Response } from "express";
import { TAP_ID, TOTEM_ID } from "../shared/totem";
import { DEFAULT_OPERATION_CONFIG, parseQrPayload } from "../shared/totemOperation";

type SessionStatus = "idle" | "authorized" | "pouring" | "finished" | "blocked" | "error" | "offline";

type TapSession = {
  sessionId: string;
  status: SessionStatus;
  maxVolumeMl: number;
  maxValueCents: number;
  product: { id: string; name: string; pricePerLiter: number; pricePer100mlCents: number };
  createdAt: number;
  finishedAt?: number;
  operationId?: string;
};

type StoredResponse = { status: number; body: Record<string, unknown> };

const state: {
  session: TapSession | null;
  idempotentResponses: Map<string, StoredResponse>;
  faceTokens: Map<string, { userId: string; createdAt: number }>;
  latestHeartbeat: number | null;
  processedOperations: Set<string>;
  operations: Array<Record<string, unknown>>;
} = {
  session: null,
  idempotentResponses: new Map(),
  faceTokens: new Map(),
  latestHeartbeat: null,
  processedOperations: new Set(),
  operations: [],
};

function jsonError(res: Response, status: number, code: string, message: string) {
  return res.status(status).json({ error: code, message, timestamp: Math.floor(Date.now() / 1000) });
}

function validateTotem(req: Request, res: Response, tapId: string) {
  const allowInsecureLocalApi = process.env.ALLOW_INSECURE_LOCAL_API === "true";
  if (process.env.NODE_ENV === "production" && !allowInsecureLocalApi && req.protocol !== "https" && req.header("x-forwarded-proto") !== "https") {
    jsonError(res, 400, "HTTPS_REQUIRED", "A comunicação do Totem exige HTTPS/TLS.");
    return false;
  }
  const configuredToken = process.env.TOTEM_API_TOKEN;
  if (configuredToken && req.header("Authorization") !== `Bearer ${configuredToken}`) {
    jsonError(res, 401, "INVALID_TOTEM_CREDENTIALS", "Credencial do Totem inválida.");
    return false;
  }
  const totemId = req.header("X-Totem-ID");
  if (!totemId) {
    jsonError(res, 401, "MISSING_TOTEM_ID", "O cabeçalho X-Totem-ID é obrigatório.");
    return false;
  }
  if (totemId !== TOTEM_ID || tapId !== TAP_ID) {
    jsonError(res, 403, "TOTEM_TAP_MISMATCH", "Totem ou torneira não autorizados.");
    return false;
  }
  return true;
}

function idempotencyKey(req: Request, res: Response) {
  const key = req.header("Idempotency-Key");
  if (!key) {
    jsonError(res, 400, "MISSING_IDEMPOTENCY_KEY", "O cabeçalho Idempotency-Key é obrigatório.");
    return null;
  }
  return key;
}

function cachedResponse(res: Response, key: string) {
  const cached = state.idempotentResponses.get(key);
  if (cached) {
    res.setHeader("Idempotency-Replayed", "true");
    res.status(cached.status).json(cached.body);
    return true;
  }
  return false;
}

function remember(key: string, status: number, body: Record<string, unknown>) {
  state.idempotentResponses.set(key, { status, body });
  if (state.idempotentResponses.size > 250) {
    const oldest = state.idempotentResponses.keys().next().value;
    if (oldest) state.idempotentResponses.delete(oldest);
  }
}

export function resetTapSimulator() {
  state.session = null;
  state.idempotentResponses.clear();
  state.faceTokens.clear();
  state.latestHeartbeat = null;
  state.processedOperations.clear();
  state.operations.length = 0;
}

export function getTapSimulatorState() {
  return { ...state, idempotentResponses: undefined, processedOperations: undefined };
}

export function registerTapApi(app: Express) {
  app.get("/api/public/totem/:totemId/products", (req, res) => {
    if (req.params.totemId !== TOTEM_ID) return jsonError(res, 403, "TOTEM_NOT_FOUND", "Totem não autorizado.");
    return res.json({ totem_id: TOTEM_ID, products: [{ id: "brahma-lager", name: "Brahma", brand: "Brahma", brewery: "Ambev", style: "American Lager", abv: 2.5, ibu: 14, price_per_liter: 15.99, price_per_100ml_cents: 160, tap_id: TAP_ID }] });
  });
  app.get("/api/public/totem/:totemId/config", (req, res) => {
    if (req.params.totemId !== TOTEM_ID) return jsonError(res, 403, "TOTEM_NOT_FOUND", "Totem não autorizado.");
    return res.json({ totem_id: TOTEM_ID, operation: DEFAULT_OPERATION_CONFIG, api_version: "v2" });
  });
  app.get("/api/public/totem/:totemId/operations", (req, res) => {
    if (req.params.totemId !== TOTEM_ID) return jsonError(res, 403, "TOTEM_NOT_FOUND", "Totem não autorizado.");
    return res.json({ totem_id: TOTEM_ID, operations: state.operations });
  });
  app.get("/api/public/tap/health", (req, res) => {
    const totemId = req.header("X-Totem-ID");
    if (totemId && totemId !== TOTEM_ID) {
      return jsonError(res, 403, "INVALID_TOTEM", "Totem não autorizado.");
    }
    return res.json({ status: "healthy", service: "maverick-tap-api", timestamp: Math.floor(Date.now() / 1000) });
  });

  app.get("/api/public/tap/:tapId/status", (req, res) => {
    const { tapId } = req.params;
    if (!validateTotem(req, res, tapId)) return;
    return res.json({
      tap_id: tapId,
      totem_id: TOTEM_ID,
      status: state.session?.status === "finished" ? "idle" : state.session?.status ?? "idle",
      session_id: state.session?.sessionId ?? null,
      relay: state.session?.status === "pouring" ? "on" : "off",
      updated_at: Math.floor(Date.now() / 1000),
    });
  });

  app.get("/api/public/tap/:tapId/command", (req, res) => {
    const { tapId } = req.params;
    if (!validateTotem(req, res, tapId)) return;
    const active = state.session;
    if (!active || active.status === "finished" || active.status === "blocked") {
      return res.json({ tap_id: tapId, status: "idle", command: null, session: null, timestamp: Math.floor(Date.now() / 1000) });
    }
    const command = active.status === "error"
      ? { type: "emergency_stop", session_id: active.sessionId, authorized: false }
      : {
          type: "start_pour",
          authorized: true,
          session_id: active.sessionId,
          max_volume_ml: active.maxVolumeMl,
          max_value_cents: active.maxValueCents,
          product: { id: active.product.id, name: active.product.name, price_per_liter: active.product.pricePerLiter, price_per_100ml_cents: active.product.pricePer100mlCents },
        };
    return res.json({
      tap_id: tapId,
      status: active.status === "pouring" ? "busy" : "authorized",
      command,
      session: { session_id: active.sessionId, started_at: active.createdAt },
      timestamp: Math.floor(Date.now() / 1000),
    });
  });

  app.post("/api/public/tap/:tapId/open", (req, res) => {
    const { tapId } = req.params;
    if (!validateTotem(req, res, tapId)) return;
    const key = idempotencyKey(req, res);
    if (!key || cachedResponse(res, key)) return;
    const { session_id, operation_id, max_volume_ml, max_value_cents, product } = req.body ?? {};
    if (!session_id || !Number.isFinite(max_volume_ml) || max_volume_ml <= 0 || !Number.isFinite(max_value_cents) || max_value_cents <= 0 || !product?.name || !Number.isFinite(product.price_per_100ml_cents)) {
      return jsonError(res, 422, "INVALID_OPEN_PAYLOAD", "Sessão, limites e produto válidos são obrigatórios.");
    }
    if (state.session && !["finished", "blocked", "error"].includes(state.session.status) && state.session.sessionId !== session_id) {
      return jsonError(res, 409, "TAP_BUSY", "A torneira possui uma sessão ativa.");
    }
    state.session = {
      sessionId: session_id,
      status: "authorized",
      maxVolumeMl: max_volume_ml,
      maxValueCents: max_value_cents,
      product: { id: product.id ?? "unknown", name: product.name, pricePerLiter: Number(product.price_per_liter ?? product.price_per_100ml_cents * 10 / 100), pricePer100mlCents: product.price_per_100ml_cents },
      createdAt: Math.floor(Date.now() / 1000),
      operationId: operation_id ?? session_id,
    };
    const body = { accepted: true, session_id, status: "authorized", relay: "off", command: "start_pour" };
    remember(key, 202, body);
    return res.status(202).json(body);
  });

  app.post("/api/public/tap/:tapId/close", (req, res) => {
    const { tapId } = req.params;
    if (!validateTotem(req, res, tapId)) return;
    const key = idempotencyKey(req, res);
    if (!key || cachedResponse(res, key)) return;
    if (state.session) state.session.status = "blocked";
    const body = { accepted: true, session_id: req.body?.session_id ?? state.session?.sessionId ?? null, status: "blocked", relay: "off" };
    remember(key, 200, body);
    return res.json(body);
  });

  app.post("/api/public/tap/:tapId/finished", (req, res) => {
    const { tapId } = req.params;
    if (!validateTotem(req, res, tapId)) return;
    const key = idempotencyKey(req, res);
    if (!key || cachedResponse(res, key)) return;
    const { session_id, status, volume_poured_ml, value_cents } = req.body ?? {};
    if (!session_id || !["finished", "not_started", "interrupted", "error"].includes(status) || !Number.isFinite(volume_poured_ml) || volume_poured_ml < 0 || !Number.isFinite(value_cents) || value_cents < 0) {
      return jsonError(res, 422, "INVALID_FINISHED_PAYLOAD", "Dados de encerramento inválidos.");
    }
    if (state.session && state.session.sessionId !== session_id) {
      return jsonError(res, 409, "SESSION_MISMATCH", "A sessão não corresponde à torneira ativa.");
    }
    if (state.session) {
      state.session.status = status === "finished" || status === "not_started" ? "finished" : "error";
      state.session.finishedAt = Math.floor(Date.now() / 1000);
      state.operations.push({ ID_OPERACAO: state.session.operationId ?? session_id, ID_TOTEM: TOTEM_ID, ID_TORNEIRA: tapId, ID_PRODUTO: state.session.product.id, VALOR_LITRO: state.session.product.pricePerLiter, VOLUME_ML: volume_poured_ml, VOLUME_LITROS: volume_poured_ml / 1000, VALOR_TOTAL: value_cents / 100, DATA_HORA_INICIO: new Date(state.session.createdAt * 1000).toISOString(), DATA_HORA_FIM: new Date(state.session.finishedAt * 1000).toISOString(), STATUS: status });
    }
    const body = { received: true, session_closed: true, status, debited_cents: value_cents };
    remember(key, 200, body);
    return res.json(body);
  });

  app.post("/api/public/tap/:tapId/heartbeat", (req, res) => {
    const { tapId } = req.params;
    if (!validateTotem(req, res, tapId)) return;
    const key = idempotencyKey(req, res);
    if (!key || cachedResponse(res, key)) return;
    state.latestHeartbeat = Math.floor(Date.now() / 1000);
    const body = { acknowledged: true, server_time: state.latestHeartbeat, status: state.session?.status ?? "idle" };
    remember(key, 200, body);
    return res.json(body);
  });

  app.post("/api/public/tap/:tapId/emergency-stop", (req, res) => {
    const { tapId } = req.params;
    if (!validateTotem(req, res, tapId)) return;
    const key = idempotencyKey(req, res);
    if (!key || cachedResponse(res, key)) return;
    if (state.session) state.session.status = "error";
    const body = { accepted: true, status: "error", relay: "off", error_code: "EMERGENCY_STOP" };
    remember(key, 202, body);
    return res.status(202).json(body);
  });

  app.post("/api/public/tap/:tapId/authorize/face", (req, res) => {
    const { tapId } = req.params;
    if (!validateTotem(req, res, tapId)) return;
    const key = idempotencyKey(req, res);
    if (!key || cachedResponse(res, key)) return;
    const { phase, pin, face_image_base64, face_token, nonce } = req.body ?? {};
    if (phase === "recognize") {
      if (!face_image_base64 || !nonce) return jsonError(res, 422, "MISSING_FACE_DATA", "Imagem facial e nonce são obrigatórios.");
      if (face_image_base64 === "face-not-recognized") {
        const body = { recognized: false, reason: "FACE_NOT_RECOGNIZED" };
        remember(key, 200, body);
        return res.json(body);
      }
      const token = `face-${Date.now()}-${String(nonce).slice(0, 12)}`;
      state.faceTokens.set(token, { userId: "demo-wallet-user", createdAt: Math.floor(Date.now() / 1000) });
      const body = { recognized: true, face_token: token, user_id: "demo-wallet-user", match_score: 0.98 };
      remember(key, 200, body);
      return res.json(body);
    }
    const recognizedFace = phase === "authorize" ? state.faceTokens.get(String(face_token)) : null;
    if (!pin || !nonce || (phase === "authorize" && !recognizedFace) || (!phase && !face_image_base64)) {
      return jsonError(res, 422, "MISSING_IDENTITY_DATA", "PIN, reconhecimento facial e nonce são obrigatórios.");
    }
    // Simulador: esta condição existe apenas para validar a integração local. A decisão biométrica real pertence ao backend da Wallet.
    if (pin !== "250712") {
      const body = { authorized: false, reason: "INVALID_PIN" };
      remember(key, 200, body);
      return res.json(body);
    }
    const body = { authorized: true, session_id: `wallet-${Date.now()}`, user_id: recognizedFace?.userId ?? "demo-wallet-user", max_value_cents: 10000, max_volume_ml: 1000, match_score: 0.98 };
    remember(key, 200, body);
    return res.json(body);
  });

  app.post("/api/public/tap/:tapId/authorize/qr", (req, res) => {
    const { tapId } = req.params;
    if (!validateTotem(req, res, tapId)) return;
    const key = idempotencyKey(req, res);
    if (!key || cachedResponse(res, key)) return;
    const { qr_payload, nonce, timestamp, operation_id } = req.body ?? {};
    const now = Math.floor(Date.now() / 1000);
    const isFresh = Number.isFinite(timestamp) && Math.abs(now - timestamp) <= 120;
    const parsed = typeof qr_payload === "string" ? parseQrPayload(qr_payload) : null;
    const looksLikeWalletPayload = typeof qr_payload === "string" && qr_payload.length >= 12;
    if ((!parsed && !looksLikeWalletPayload) || typeof nonce !== "string" || nonce.length < 12 || !isFresh) {
      const body = { authorized: false, reason: "INVALID_OR_EXPIRED_QR" };
      remember(key, 200, body);
      return res.json(body);
    }
    if (operation_id && state.processedOperations.has(operation_id)) {
      const body = { authorized: false, reason: "DUPLICATE_OPERATION" };
      remember(key, 409, body);
      return res.status(409).json(body);
    }
    if (operation_id) state.processedOperations.add(operation_id);
    // Simulador: em produção o payload é verificado por assinatura, nonce armazenado e sessão da Wallet.
    const body = { authorized: true, session_id: `wallet-qr-${Date.now()}`, operation_id: operation_id ?? `op-${Date.now()}`, user_id: "demo-wallet-user", authorization_method: "qr", tap_id: parsed?.tapId ?? tapId, totem_id: parsed?.totemId ?? TOTEM_ID, product_id: parsed?.productId ?? null, price_per_liter: parsed?.pricePerLiter ?? null };
    remember(key, 200, body);
    return res.json(body);
  });
}
