import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPendingFinished, queuePendingFinished, tapApi } from "./tapApi";

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  vi.stubGlobal("window", { setTimeout: (callback: () => void) => { callback(); return 0; } });
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
  });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { onLine: true } });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("camada de comunicação do totem", () => {
  it("refaz uma chamada POST com atraso exponencial até obter resposta", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error("Rede indisponível"))
      .mockRejectedValueOnce(new Error("Rede indisponível"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ authorized: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(tapApi.authorizeQr({ qr_payload: "wallet-demo-code", nonce: "a".repeat(24), timestamp: 123 })).resolves.toMatchObject({ authorized: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "POST" });
  });

  it("mantém o fechamento pendente e o remove somente após o reenvio aceito", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ received: true, status: "finished" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const payload = { session_id: "session-pending-01", status: "finished", volume_poured_ml: 250, value_cents: 498 };

    queuePendingFinished(payload, "finished-pending-key");
    await flushPendingFinished();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(store.get("maverick.pending-finished")).toBe("[]");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "POST" });
  });
});
