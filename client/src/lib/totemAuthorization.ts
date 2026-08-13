import type { CommandResponse } from "./tapApi";

type ProductAuthorization = {
  name: string;
  pricePer100mlCents: number;
};

export type TotemAuthorizationApi = {
  authorizeQr: (payload: Record<string, unknown>) => Promise<{ authorized: boolean; reason?: string }>;
  authorizeFace: (payload: Record<string, unknown>) => Promise<{ authorized: boolean; reason?: string }>;
  open: (payload: Record<string, unknown>, key: string) => Promise<{ accepted: boolean; status: string }>;
  getCommand: () => Promise<CommandResponse>;
};

export function getAuthorizedPourSession(command: CommandResponse) {
  return command.command?.type === "start_pour" && command.command.session_id ? command.command.session_id : null;
}

export function getIdlePourTransition(command: CommandResponse) {
  const sessionId = getAuthorizedPourSession(command);
  return sessionId ? { screen: "pouring" as const, sessionId } : null;
}

export async function validateWalletQr(api: TotemAuthorizationApi, payload: Record<string, unknown>) {
  return api.authorizeQr(payload);
}

export async function authorizeWalletQrThenRequestPour(
  api: TotemAuthorizationApi,
  payload: Record<string, unknown>,
  requestPour: () => Promise<void>,
) {
  const response = await validateWalletQr(api, payload);
  if (!response.authorized) return false;
  await requestPour();
  return true;
}

export async function authorizeFaceThenRequestPour(
  api: TotemAuthorizationApi,
  payload: Record<string, unknown>,
  requestPour: () => Promise<void>,
) {
  const response = await api.authorizeFace(payload);
  if (!response.authorized) return false;
  await requestPour();
  return true;
}

export async function requestAuthorizedPour(
  api: TotemAuthorizationApi,
  sessionId: string,
  product: ProductAuthorization,
) {
  return api.open({
    session_id: sessionId,
    command: "open",
    max_volume_ml: 500,
    max_value_cents: 5000,
    timeout_sec: 90,
    product: { name: product.name, price_per_100ml_cents: product.pricePer100mlCents },
  }, `${sessionId}-open`);
}

export async function pollForAuthorizedPour(api: TotemAuthorizationApi) {
  return getAuthorizedPourSession(await api.getCommand());
}
