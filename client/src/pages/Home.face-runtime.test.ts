// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tapMocks = vi.hoisted(() => ({
  authorizeFace: vi.fn(),
  getCommand: vi.fn(),
  open: vi.fn(),
  finished: vi.fn(),
  emergencyStop: vi.fn(),
}));

vi.mock("@/lib/tapApi", () => ({
  tapApi: {
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
