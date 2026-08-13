import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CardDetails, Face, FacePassword, Idle } from "./Home";
import { authorizeFaceThenRequestPour, authorizeWalletQrThenRequestPour, getFaceAuthorizedLimits, getIdlePourTransition, recognizeFace, requestAuthorizedPour, type TotemAuthorizationApi } from "@/lib/totemAuthorization";

const noop = () => undefined;

describe("fluxos preservados sem confirmação intermediária", () => {
  it("mantém QR Code, Face ID e cartão disponíveis para o cliente", () => {
    const idle = renderToStaticMarkup(createElement(Idle, { qrValue: "maverick://tap/wallet-session", seconds: 30, onFace: noop, onCard: noop, onDev: noop }));
    const face = renderToStaticMarkup(createElement(Face, { active: false, onActivate: noop, onCancel: noop }));
    const password = renderToStaticMarkup(createElement(FacePassword, { password: "", submitting: false, setPassword: noop, onCancel: noop, onContinue: noop }));
    const card = renderToStaticMarkup(createElement(CardDetails, { name: "Cliente de teste", cpf: "12345678901", birth: "01/01/1990", setName: noop, setCpf: noop, setBirth: noop, onCancel: noop, onContinue: noop }));

    expect(idle).toContain('class="qr-frame"');
    expect(idle).toContain("USAR FACE ID");
    expect(idle).toContain("COMPRAR COM CARTÃO");
    expect(face).toContain("Captura facial");
    expect(password).toContain("Informe sua senha");
    expect(password).toContain('type="password"');
    expect(card).toContain("Nome completo");
    expect(card).toContain("CPF");
    expect(card).toContain("Continuar");
  });

  it("só solicita abertura após Face ID, senha e autorização com limites do servidor", async () => {
    const api: TotemAuthorizationApi = {
      authorizeQr: vi.fn().mockResolvedValue({ authorized: true }),
      authorizeFace: vi.fn()
        .mockResolvedValueOnce({ recognized: true, face_token: "face-token-01", user_id: "cliente-01" })
        .mockResolvedValueOnce({ authorized: true, session_id: "wallet-face-01", user_id: "cliente-01", max_value_cents: 7250, max_volume_ml: 650 }),
      open: vi.fn().mockResolvedValue({ accepted: true, status: "authorized" }),
      getCommand: vi.fn().mockResolvedValue({ status: "idle", command: null }),
    };
    const startWalletPour = vi.fn().mockResolvedValue(undefined);
    const startFacePour = vi.fn().mockImplementation(limits => requestAuthorizedPour(api, "session-face-01", { name: "Heineken Lager", pricePer100mlCents: 349 }, limits));

    await expect(authorizeWalletQrThenRequestPour(api, { qr_payload: "wallet-token", nonce: "valid-nonce" }, startWalletPour)).resolves.toBe(true);
    await expect(recognizeFace(api, { face_image_base64: "face", nonce: "valid-nonce" })).resolves.toEqual({ faceToken: "face-token-01", customerId: "cliente-01" });
    await expect(authorizeFaceThenRequestPour(api, { phase: "authorize", pin: "1234", face_token: "face-token-01", nonce: "valid-nonce" }, startFacePour)).resolves.toBe(true);

    expect(api.authorizeQr).toHaveBeenCalledOnce();
    expect(api.authorizeFace).toHaveBeenNthCalledWith(1, expect.objectContaining({ phase: "recognize", face_image_base64: "face" }));
    expect(api.authorizeFace).toHaveBeenNthCalledWith(2, expect.objectContaining({ phase: "authorize", pin: "1234", face_token: "face-token-01" }));
    expect(startWalletPour).toHaveBeenCalledOnce();
    expect(startFacePour).toHaveBeenCalledWith({ authorizationSessionId: "wallet-face-01", customerId: "cliente-01", maxValueCents: 7250, maxVolumeMl: 650 });
    expect(api.open).toHaveBeenCalledWith(expect.objectContaining({ session_id: "session-face-01", max_value_cents: 7250, max_volume_ml: 650, customer_id: "cliente-01", authorization_session_id: "wallet-face-01" }), "session-face-01-open");
  });

  it("recusa autorização facial sem identidade e limites positivos do servidor", async () => {
    const api: TotemAuthorizationApi = {
      authorizeQr: vi.fn(),
      authorizeFace: vi.fn().mockResolvedValue({ authorized: true, session_id: "wallet-face-01", user_id: "cliente-01", max_value_cents: 0, max_volume_ml: 650 }),
      open: vi.fn(),
      getCommand: vi.fn().mockResolvedValue({ status: "idle", command: null }),
    };
    const startPour = vi.fn();

    expect(getFaceAuthorizedLimits({ authorized: true, session_id: "wallet-face-01", user_id: "cliente-01", max_value_cents: 0, max_volume_ml: 650 })).toBeNull();
    await expect(authorizeFaceThenRequestPour(api, { pin: "1234", face_image_base64: "face", nonce: "valid-nonce" }, startPour)).resolves.toBe(false);
    expect(startPour).not.toHaveBeenCalled();
    expect(api.open).not.toHaveBeenCalled();
  });

  it("bloqueia a tela de senha quando o servidor não reconhece a captura facial", async () => {
    const api: TotemAuthorizationApi = { authorizeQr: vi.fn(), authorizeFace: vi.fn().mockResolvedValue({ recognized: false, reason: "FACE_NOT_RECOGNIZED" }), open: vi.fn(), getCommand: vi.fn().mockResolvedValue({ status: "idle", command: null }) };
    await expect(recognizeFace(api, { face_image_base64: "face-capture", nonce: "valid-nonce" })).resolves.toBeNull();
    expect(api.authorizeFace).toHaveBeenCalledWith(expect.objectContaining({ phase: "recognize" }));
  });

  it("mapeia para dispensação somente o comando start_pour com limites autorizados", () => {
    expect(getIdlePourTransition({ status: "idle", command: null })).toBeNull();
    expect(getIdlePourTransition({ status: "authorized", command: { type: "start_pour", session_id: "session-sem-limite" } })).toBeNull();
    expect(getIdlePourTransition({ status: "authorized", command: { type: "close", session_id: "session-server-01", max_volume_ml: 500, max_value_cents: 5000 } })).toBeNull();
    expect(getIdlePourTransition({ status: "authorized", command: { type: "start_pour", session_id: "session-server-01", max_volume_ml: 500, max_value_cents: 5000 } })).toEqual({ screen: "pouring", sessionId: "session-server-01", maxVolumeMl: 500, maxValueCents: 5000 });
  });
});
