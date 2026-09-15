import { calculateValueCents } from "./totem";

export type OperationStatus = "authorized" | "not_started" | "finished" | "interrupted" | "error";
export type OperationRecord = {
  operationId: string;
  totemId: string;
  tapId: string;
  productId: string;
  pricePerLiter: number;
  volumeMl: number;
  volumeLiters: number;
  totalCents: number;
  startedAt: string;
  finishedAt: string;
  status: OperationStatus;
  errorCode?: string;
};
export type OperationConfig = {
  noFlowStartTimeoutSec: number;
  flowStopTimeoutSec: number;
  maxSafetyTimeoutSec: number;
  flowThresholdPulsesPerSec: number;
  pulsesPerLiter: number;
};
export const DEFAULT_OPERATION_CONFIG: OperationConfig = {
  noFlowStartTimeoutSec: 10,
  flowStopTimeoutSec: 5,
  maxSafetyTimeoutSec: 90,
  flowThresholdPulsesPerSec: 0.5,
  pulsesPerLiter: 450,
};

export function buildQrPayload(input: { totemId: string; tapId: string; productId: string; pricePerLiter: number }) {
  return `maverick://purchase?ID_TOTEM=${encodeURIComponent(input.totemId)}&ID_TORNEIRA=${encodeURIComponent(input.tapId)}&ID_PRODUTO=${encodeURIComponent(input.productId)}&VALOR_LITRO=${input.pricePerLiter.toFixed(2)}`;
}
export function parseQrPayload(payload: string) {
  try {
    const url = new URL(payload);
    if (url.protocol !== "maverick:") return null;
    const values = Object.fromEntries(url.searchParams.entries());
    const price = Number(values.VALOR_LITRO);
    if (!values.ID_TOTEM || !values.ID_TORNEIRA || !values.ID_PRODUTO || !Number.isFinite(price) || price <= 0) return null;
    return { totemId: values.ID_TOTEM, tapId: values.ID_TORNEIRA, productId: values.ID_PRODUTO, pricePerLiter: price };
  } catch { return null; }
}
export function volumeFromPulses(pulses: number, pulsesPerLiter: number) {
  if (!Number.isFinite(pulses) || !Number.isFinite(pulsesPerLiter) || pulses < 0 || pulsesPerLiter <= 0) return 0;
  return (pulses / pulsesPerLiter) * 1000;
}
export function valueFromVolume(volumeMl: number, pricePerLiter: number) {
  return Math.max(0, Math.round((Math.max(0, volumeMl) / 1000) * pricePerLiter * 100));
}
export function createOperationRecord(input: Omit<OperationRecord, "volumeLiters" | "totalCents"> & { volumeMl: number; pricePerLiter: number }) {
  return { ...input, volumeLiters: input.volumeMl / 1000, totalCents: valueFromVolume(input.volumeMl, input.pricePerLiter) };
}

export type FlowDecision = "waiting_for_flow" | "pouring" | "stopping" | "finished" | "safety_timeout";
export function decideFlowState(input: { elapsedSec: number; pulsesPerSec: number; hasStarted: boolean; stoppedForSec: number; config?: OperationConfig }): FlowDecision {
  const config = { ...DEFAULT_OPERATION_CONFIG, ...input.config };
  if (input.elapsedSec >= config.maxSafetyTimeoutSec) return "safety_timeout";
  if (!input.hasStarted && input.elapsedSec >= config.noFlowStartTimeoutSec) return "finished";
  if (input.pulsesPerSec >= config.flowThresholdPulsesPerSec) return "pouring";
  if (input.hasStarted && input.stoppedForSec >= config.flowStopTimeoutSec) return "finished";
  return input.hasStarted ? "stopping" : "waiting_for_flow";
}

export class OperationRegistry {
  private readonly processed = new Set<string>();
  private readonly records: OperationRecord[] = [];
  accept(operationId: string) { if (!operationId || this.processed.has(operationId)) return false; this.processed.add(operationId); return true; }
  add(record: OperationRecord) { this.records.push(record); }
  has(operationId: string) { return this.processed.has(operationId); }
  all() { return [...this.records]; }
}

export function calculateOperationValue(volumeMl: number, pricePerLiter: number) {
  return calculateValueCents(volumeMl, Math.round(pricePerLiter * 10));
}
