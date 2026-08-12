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
});
