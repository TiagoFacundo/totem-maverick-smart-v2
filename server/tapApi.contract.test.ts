import express from "express";
import { createServer } from "http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { registerTapApi, resetTapSimulator } from "./tapApi";

let closeServer: (() => Promise<void>) | undefined;
let baseUrl = "";

beforeEach(async () => {
  resetTapSimulator();
  const app = express();
  app.use(express.json());
  registerTapApi(app);
  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Servidor de teste indisponível");
  baseUrl = `http://127.0.0.1:${address.port}`;
  closeServer = () => new Promise(resolve => server.close(() => resolve()));
});

afterEach(async () => {
  await closeServer?.();
});

describe("contrato REST da torneira", () => {
  it("exige X-Totem-ID ao consultar comandos", async () => {
    const response = await fetch(`${baseUrl}/api/public/tap/TORNEIRA_01/command`);
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: "MISSING_TOTEM_ID" });
  });

  it("autoriza, devolve o comando e fecha a sessão de forma idempotente", async () => {
    const headers = { "Content-Type": "application/json", "X-Totem-ID": "TOTEM_001", "Idempotency-Key": "open-key-001" };
    const payload = { session_id: "tap-session-001", max_volume_ml: 300, max_value_cents: 597, product: { name: "Heineken", price_per_100ml_cents: 199 } };

    const firstOpen = await fetch(`${baseUrl}/api/public/tap/TORNEIRA_01/open`, { method: "POST", headers, body: JSON.stringify(payload) });
    expect(firstOpen.status).toBe(202);
    await expect(firstOpen.json()).resolves.toMatchObject({ accepted: true, status: "authorized" });

    const replayedOpen = await fetch(`${baseUrl}/api/public/tap/TORNEIRA_01/open`, { method: "POST", headers, body: JSON.stringify(payload) });
    expect(replayedOpen.headers.get("Idempotency-Replayed")).toBe("true");
    await expect(replayedOpen.json()).resolves.toMatchObject({ accepted: true, session_id: "tap-session-001" });

    const command = await fetch(`${baseUrl}/api/public/tap/TORNEIRA_01/command`, { headers: { "X-Totem-ID": "TOTEM_001" } });
    await expect(command.json()).resolves.toMatchObject({ status: "authorized", command: { type: "start_pour", max_volume_ml: 300 } });

    const finished = await fetch(`${baseUrl}/api/public/tap/TORNEIRA_01/finished`, {
      method: "POST",
      headers: { ...headers, "Idempotency-Key": "finished-key-001" },
      body: JSON.stringify({ session_id: "tap-session-001", status: "finished", volume_poured_ml: 300, value_cents: 597 }),
    });
    await expect(finished.json()).resolves.toMatchObject({ received: true, session_closed: true, status: "finished" });
  });

  it("rejeita QR Code com nonce ou tempo de validade inválidos", async () => {
    const response = await fetch(`${baseUrl}/api/public/tap/TORNEIRA_01/authorize/qr`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Totem-ID": "TOTEM_001", "Idempotency-Key": "qr-key-001" },
      body: JSON.stringify({ qr_payload: "wallet-code", nonce: "short", timestamp: 1 }),
    });
    await expect(response.json()).resolves.toMatchObject({ authorized: false, reason: "INVALID_OR_EXPIRED_QR" });
  });

  it("mantém a solenoide bloqueada até a validação facial, senha e limites autorizados serem encaminhados ao comando", async () => {
    const recognition = await fetch(`${baseUrl}/api/public/tap/TORNEIRA_01/authorize/face`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Totem-ID": "TOTEM_001", "Idempotency-Key": "face-key-001" },
      body: JSON.stringify({ phase: "recognize", face_image_base64: "face-capture", nonce: "face-nonce-001" }),
    });
    expect(recognition.status).toBe(200);
    const face = await recognition.json() as { recognized: boolean; face_token: string; user_id: string };
    expect(face).toMatchObject({ recognized: true, user_id: "demo-wallet-user" });

    const preOpenCommand = await fetch(`${baseUrl}/api/public/tap/TORNEIRA_01/command`, { headers: { "X-Totem-ID": "TOTEM_001" } });
    await expect(preOpenCommand.json()).resolves.toMatchObject({ status: "idle", command: null });

    const identity = await fetch(`${baseUrl}/api/public/tap/TORNEIRA_01/authorize/face`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Totem-ID": "TOTEM_001", "Idempotency-Key": "face-password-key-001" },
      body: JSON.stringify({ phase: "authorize", pin: "250712", face_token: face.face_token, nonce: "face-nonce-001" }),
    });
    expect(identity.status).toBe(200);
    const authorization = await identity.json() as { authorized: boolean; user_id: string; max_value_cents: number; max_volume_ml: number };
    expect(authorization).toMatchObject({ authorized: true, user_id: "demo-wallet-user", max_value_cents: 10000, max_volume_ml: 1000 });

    const opened = await fetch(`${baseUrl}/api/public/tap/TORNEIRA_01/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Totem-ID": "TOTEM_001", "Idempotency-Key": "face-open-key-001" },
      body: JSON.stringify({ session_id: "face-session-001", max_volume_ml: authorization.max_volume_ml, max_value_cents: authorization.max_value_cents, customer_id: authorization.user_id, authorization_session_id: "wallet-face-001", product: { name: "Heineken", price_per_100ml_cents: 349 } }),
    });
    expect(opened.status).toBe(202);

    const command = await fetch(`${baseUrl}/api/public/tap/TORNEIRA_01/command`, { headers: { "X-Totem-ID": "TOTEM_001" } });
    await expect(command.json()).resolves.toMatchObject({ command: { type: "start_pour", session_id: "face-session-001", max_volume_ml: 1000, max_value_cents: 10000 } });
  });

  it("recusa a captura biométrica não reconhecida sem disponibilizar comando de dispensação", async () => {
    const recognition = await fetch(`${baseUrl}/api/public/tap/TORNEIRA_01/authorize/face`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Totem-ID": "TOTEM_001", "Idempotency-Key": "face-failure-key-001" },
      body: JSON.stringify({ phase: "recognize", face_image_base64: "face-not-recognized", nonce: "face-nonce-failure" }),
    });
    await expect(recognition.json()).resolves.toMatchObject({ recognized: false, reason: "FACE_NOT_RECOGNIZED" });

    const command = await fetch(`${baseUrl}/api/public/tap/TORNEIRA_01/command`, { headers: { "X-Totem-ID": "TOTEM_001" } });
    await expect(command.json()).resolves.toMatchObject({ status: "idle", command: null });
  });
});
