// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tapMocks = vi.hoisted(() => ({
  authorizeQr: vi.fn(),
  authorizeFace: vi.fn(),
  getCommand: vi.fn(),
  open: vi.fn(),
  finished: vi.fn(),
  emergencyStop: vi.fn(),
}));

vi.mock("@/lib/tapApi", () => ({
  tapApi: {
    authorizeQr: tapMocks.authorizeQr,
    authorizeFace: tapMocks.authorizeFace,
    getCommand: tapMocks.getCommand,
    open: tapMocks.open,
    finished: tapMocks.finished,
    emergencyStop: tapMocks.emergencyStop,
  },
  flushPendingFinished: vi.fn(),
  queuePendingFinished: vi.fn(),
}));

import Home from "./Home";

describe("runtime do fluxo de Face ID", () => {
  beforeEach(() => {
    tapMocks.authorizeQr.mockReset().mockResolvedValue({ authorized: true });
    tapMocks.authorizeFace.mockReset();
    tapMocks.getCommand.mockReset().mockResolvedValue({ status: "idle", command: null });
    tapMocks.open.mockReset().mockResolvedValue({ accepted: true, status: "authorized" });
    tapMocks.finished.mockReset().mockResolvedValue({ received: true, status: "finished" });
    tapMocks.emergencyStop.mockReset().mockResolvedValue({ accepted: true, status: "error" });
  });

  afterEach(() => cleanup());

  it("mostra a senha somente após o reconhecimento facial confirmado pelo servidor", async () => {
    tapMocks.authorizeFace.mockResolvedValue({ recognized: true, face_token: "face-token-runtime", user_id: "cliente-runtime" });
    const user = userEvent.setup();
    render(createElement(Home));

    expect(screen.queryByRole("heading", { name: "Informe sua senha" })).toBeNull();
    await user.click(screen.getByRole("button", { name: /usar face id/i }));
    await user.click(screen.getByRole("button", { name: "Iniciar captura facial" }));

    expect(await screen.findByRole("heading", { name: "Informe sua senha" })).not.toBeNull();
    expect(tapMocks.authorizeFace).toHaveBeenCalledWith(expect.objectContaining({ phase: "recognize", face_image_base64: "simulated-face-capture" }));
  });

  it("direciona o cliente validado à tela Servindo seu chopp com os limites autorizados", async () => {
    tapMocks.authorizeFace
      .mockResolvedValueOnce({ recognized: true, face_token: "face-token-serving", user_id: "cliente-runtime" })
      .mockResolvedValueOnce({ authorized: true, session_id: "wallet-serving", user_id: "cliente-runtime", max_value_cents: 7250, max_volume_ml: 650 });
    const user = userEvent.setup();
    render(createElement(Home));

    await user.click(screen.getByRole("button", { name: /usar face id/i }));
    await user.click(screen.getByRole("button", { name: "Iniciar captura facial" }));
    await user.type(await screen.findByLabelText("Senha da Wallet"), "1234");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    expect(await screen.findByRole("heading", { name: "Servindo seu chopp" })).not.toBeNull();
    await waitFor(() => expect(tapMocks.open).toHaveBeenCalledWith(expect.objectContaining({ max_volume_ml: 650, max_value_cents: 7250, customer_id: "cliente-runtime" }), expect.any(String)));
    expect(screen.getByText("#wallet-s")).not.toBeNull();
    expect(screen.queryByRole("button", { name: /usar face id/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /simular escaneamento/i })).toBeNull();
  });

  it("preserva os caminhos de QR Code e cartão após o ajuste de Face ID", async () => {
    const user = userEvent.setup();
    const qr = render(createElement(Home));

    await user.click(screen.getByRole("button", { name: /simular escaneamento/i }));
    await waitFor(() => expect(tapMocks.authorizeQr).toHaveBeenCalled());
    await waitFor(() => expect(tapMocks.open).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: /usar face id/i })).not.toBeNull();

    qr.unmount();
    render(createElement(Home));
    await user.click(screen.getByRole("button", { name: /comprar com cartão/i }));
    expect(await screen.findByRole("heading", { name: "Seus dados" })).not.toBeNull();
  });

  it("mantém a etapa de senha quando o servidor não aprova a retirada", async () => {
    tapMocks.authorizeFace
      .mockResolvedValueOnce({ recognized: true, face_token: "face-token-pending", user_id: "cliente-runtime" })
      .mockResolvedValueOnce({ authorized: false, reason: "INVALID_PIN" });
    const user = userEvent.setup();
    render(createElement(Home));

    await user.click(screen.getByRole("button", { name: /usar face id/i }));
    await user.click(screen.getByRole("button", { name: "Iniciar captura facial" }));
    await user.type(await screen.findByLabelText("Senha da Wallet"), "senha-incorreta");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    expect(await screen.findByRole("alert")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Informe sua senha" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: /usar face id/i })).toBeNull();
  });

  it("não exibe a senha e retorna ao tratamento inicial quando a biometria falha", async () => {
    tapMocks.authorizeFace.mockResolvedValue({ recognized: false, reason: "FACE_NOT_RECOGNIZED" });
    const user = userEvent.setup();
    render(createElement(Home));

    await user.click(screen.getByRole("button", { name: /usar face id/i }));
    await user.click(screen.getByRole("button", { name: "Iniciar captura facial" }));

    await waitFor(() => screen.getByRole("button", { name: /usar face id/i }));
    expect(screen.queryByRole("heading", { name: "Informe sua senha" })).toBeNull();
    expect(tapMocks.authorizeFace).toHaveBeenCalledWith(expect.objectContaining({ phase: "recognize" }));
  });
});
