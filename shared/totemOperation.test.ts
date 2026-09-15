import { describe, expect, it } from "vitest";
import { OperationRegistry, buildQrPayload, decideFlowState, parseQrPayload, valueFromVolume, volumeFromPulses } from "./totemOperation";

describe("núcleo da operação QR", () => {
  it("codifica e lê os quatro identificadores do QR", () => {
    const payload = buildQrPayload({ totemId: "TOTEM_001", tapId: "TORNEIRA_01", productId: "pilsen", pricePerLiter: 17.9 });
    expect(parseQrPayload(payload)).toEqual({ totemId: "TOTEM_001", tapId: "TORNEIRA_01", productId: "pilsen", pricePerLiter: 17.9 });
  });
  it("converte pulsos usando calibração configurável e calcula valor real", () => {
    expect(volumeFromPulses(225, 450)).toBe(500);
    expect(valueFromVolume(500, 17.9)).toBe(895);
  });
  it("fecha sem fluxo em 10s e confirma parada após 5s", () => {
    expect(decideFlowState({ elapsedSec: 10, pulsesPerSec: 0, hasStarted: false, stoppedForSec: 0 })).toBe("finished");
    expect(decideFlowState({ elapsedSec: 20, pulsesPerSec: 0, hasStarted: true, stoppedForSec: 5 })).toBe("finished");
    expect(decideFlowState({ elapsedSec: 20, pulsesPerSec: 1, hasStarted: true, stoppedForSec: 4 })).toBe("pouring");
  });
  it("prioriza timeout máximo de segurança", () => {
    expect(decideFlowState({ elapsedSec: 90, pulsesPerSec: 20, hasStarted: true, stoppedForSec: 0 })).toBe("safety_timeout");
  });
  it("rejeita autorização duplicada", () => {
    const registry = new OperationRegistry();
    expect(registry.accept("202609150001")).toBe(true);
    expect(registry.accept("202609150001")).toBe(false);
  });
});
