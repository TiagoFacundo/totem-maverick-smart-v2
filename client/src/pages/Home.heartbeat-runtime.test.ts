// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tapMocks = vi.hoisted(() => ({
  heartbeat: vi.fn(),
  getCommand: vi.fn(),
  authorizeQr: vi.fn(),
  authorizeFace: vi.fn(),
  open: vi.fn(),
  finished: vi.fn(),
  emergencyStop: vi.fn(),
}));

vi.mock("@/lib/tapApi", () => ({
  tapApi: {
    heartbeat: tapMocks.heartbeat,
    getCommand: tapMocks.getCommand,
    authorizeQr: tapMocks.authorizeQr,
    authorizeFace: tapMocks.authorizeFace,
    open: tapMocks.open,
    finished: tapMocks.finished,
    emergencyStop: tapMocks.emergencyStop,
  },
  flushPendingFinished: vi.fn(),
  queuePendingFinished: vi.fn(),
}));

import Home from "./Home";

describe("heartbeat operacional do totem", () => {
  beforeEach(() => {
    tapMocks.heartbeat.mockReset().mockResolvedValue({ acknowledged: true, status: "idle" });
    tapMocks.getCommand.mockReset().mockResolvedValue({ status: "idle", command: null });
    tapMocks.authorizeQr.mockReset().mockResolvedValue({ authorized: true });
    tapMocks.authorizeFace.mockReset();
    tapMocks.open.mockReset().mockResolvedValue({ accepted: true, status: "authorized" });
    tapMocks.finished.mockReset().mockResolvedValue({ received: true, status: "finished" });
    tapMocks.emergencyStop.mockReset().mockResolvedValue({ accepted: true, status: "error" });
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  });

  afterEach(() => cleanup());

  it("envia heartbeat ao iniciar e mantém o cabeçalho online", async () => {
    render(createElement(Home));

    await waitFor(() => expect(tapMocks.heartbeat).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("banner").querySelector(".connection.offline")).toBeNull();
  });

  it("sinaliza o totem como offline quando o heartbeat falha ainda no IDLE", async () => {
    tapMocks.heartbeat.mockRejectedValue(new Error("Servidor indisponível"));
    render(createElement(Home));

    await waitFor(() => expect(screen.getByRole("banner").querySelector(".connection.offline")).not.toBeNull());
    expect(screen.getByRole("heading", { name: "Heineken Lager" })).not.toBeNull();
  });
});
