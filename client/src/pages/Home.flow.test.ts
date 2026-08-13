import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CardDetails, Face, Idle } from "./Home";
import { authorizeFaceThenRequestPour, authorizeWalletQrThenRequestPour, getIdlePourTransition, requestAuthorizedPour, type TotemAuthorizationApi } from "@/lib/totemAuthorization";

const noop = () => undefined;

describe("fluxos preservados sem confirmação intermediária", () => {
  it("mantém QR Code, Face ID e cartão disponíveis para o cliente", () => {
    const idle = renderToStaticMarkup(createElement(Idle, {
      qrValue: "maverick://tap/wallet-session",
      seconds: 30,
      onFace: noop,
      onCard: noop,
      onDev: noop,
    }));
    const face = renderToStaticMarkup(createElement(Face, { active: false, onActivate: noop, onCancel: noop }));
    const card = renderToStaticMarkup(createElement(CardDetails, {
      name: "Cliente de teste",
      cpf: "12345678901",
      birth: "01/01/1990",
      setName: noop,
      setCpf: noop,
      setBirth: noop,
      onCancel: noop,
      onContinue: noop,
    }));

    expect(idle).toContain('class="qr-frame"');
    expect(idle).toContain("USAR FACE ID");
    expect(idle).toContain("COMPRAR COM CARTÃO");
    expect(face).toContain("Captura facial");
    expect(card).toContain("Nome completo");
    expect(card).toContain("CPF");
    expect(card).toContain("Continuar");
  });

  it("valida QR, Face ID e cartão pelo servidor sem depender de confirmação intermediária", async () => {
    const api: TotemAuthorizationApi = {
      authorizeQr: vi.fn().mockResolvedValue({ authorized: true }),
      authorizeFace: vi.fn().mockResolvedValue({ authorized: true }),
      open: vi.fn().mockResolvedValue({ accepted: true, status: "authorized" }),
      getCommand: vi.fn().mockResolvedValue({ status: "idle", command: null }),
    };
    const startPour = vi.fn().mockResolvedValue(undefined);

    await expect(authorizeWalletQrThenRequestPour(api, { qr_payload: "wallet-token", nonce: "valid-nonce" }, startPour)).resolves.toBe(true);
    await expect(authorizeFaceThenRequestPour(api, { pin: "1234", nonce: "valid-nonce" }, startPour)).resolves.toBe(true);
    await requestAuthorizedPour(api, "session-card-01", { name: "Heineken Lager", pricePer100mlCents: 349 });

    expect(api.authorizeQr).toHaveBeenCalledOnce();
    expect(api.authorizeFace).toHaveBeenCalledOnce();
    expect(startPour).toHaveBeenCalledTimes(2);
    expect(api.open).toHaveBeenCalledWith(expect.objectContaining({ session_id: "session-card-01", command: "open" }), "session-card-01-open");
  });

  it("mapeia o comando recebido em IDLE para a transição real de dispensação", () => {
    expect(getIdlePourTransition({ status: "idle", command: null })).toBeNull();
    expect(getIdlePourTransition({ status: "authorized", command: { type: "close", session_id: "session-server-01" } })).toBeNull();
    expect(getIdlePourTransition({ status: "authorized", command: { type: "start_pour", session_id: "session-server-01" } })).toEqual({ screen: "pouring", sessionId: "session-server-01" });
  });
});
