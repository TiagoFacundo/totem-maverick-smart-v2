import type { CommandResponse } from "./tapApi";

type ProductAuthorization = {
  name: string;
  pricePer100mlCents: number;
};

export type FaceServerResponse = {
  authorized?: boolean;
  recognized?: boolean;
  reason?: string;
  session_id?: string;
  user_id?: string;
  face_token?: string;
  max_value_cents?: number;
  max_volume_ml?: number;
};

export type AuthorizedPourLimits = {
  authorizationSessionId: string;
  customerId: string;
  maxValueCents: number;
  maxVolumeMl: number;
};

export type FaceRecognition = { faceToken: string; customerId: string };

export type TotemAuthorizationApi = {
  authorizeQr: (payload: Record<string, unknown>) => Promise<{ authorized: boolean; reason?: string }>;
  authorizeFace: (payload: Record<string, unknown>) => Promise<FaceServerResponse>;
  open: (payload: Record<string, unknown>, key: string) => Promise<{ accepted: boolean; status: string }>;
  getCommand: () => Promise<CommandResponse>;
};

export function getAuthorizedPourSession(command: CommandResponse) {
  return command.command?.type === "start_pour" && command.command.session_id ? command.command.session_id : null;
}

export function getIdlePourTransition(command: CommandResponse) {
  const sessionId = getAuthorizedPourSession(command);
  const maxVolumeMl = command.command?.max_volume_ml;
  const maxValueCents = command.command?.max_value_cents;
  if (!sessionId || typeof maxVolumeMl !== "number" || typeof maxValueCents !== "number" || !Number.isFinite(maxVolumeMl) || !Number.isFinite(maxValueCents) || maxVolumeMl <= 0 || maxValueCents <= 0) return null;
  return { screen: "pouring" as const, sessionId, maxVolumeMl, maxValueCents };
}

export async function recognizeFace(api: TotemAuthorizationApi, payload: Record<string, unknown>): Promise<FaceRecognition | null> {
  const response = await api.authorizeFace({ ...payload, phase: "recognize" });
  if (!response.recognized || !response.face_token || !response.user_id) return null;
  return { faceToken: response.face_token, customerId: response.user_id };
}

export function getFaceAuthorizedLimits(response: FaceServerResponse): AuthorizedPourLimits | null {
  const maxValueCents = response.max_value_cents;
  const maxVolumeMl = response.max_volume_ml;
  if (!response.authorized || !response.session_id || !response.user_id || typeof maxValueCents !== "number" || typeof maxVolumeMl !== "number" || !Number.isFinite(maxValueCents) || !Number.isFinite(maxVolumeMl) || maxValueCents <= 0 || maxVolumeMl <= 0) return null;
  return {
    authorizationSessionId: response.session_id,
    customerId: response.user_id,
    maxValueCents,
    maxVolumeMl,
  };
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
  requestPour: (limits: AuthorizedPourLimits) => Promise<void>,
) {
  const limits = getFaceAuthorizedLimits(await api.authorizeFace(payload));
  if (!limits) return false;
  await requestPour(limits);
  return true;
}

export async function requestAuthorizedPour(
  api: TotemAuthorizationApi,
  sessionId: string,
  product: ProductAuthorization,
  limits?: AuthorizedPourLimits,
) {
  return api.open({
    session_id: sessionId,
    command: "open",
    max_volume_ml: limits?.maxVolumeMl ?? 500,
    max_value_cents: limits?.maxValueCents ?? 5000,
    timeout_sec: 90,
    product: { name: product.name, price_per_100ml_cents: product.pricePer100mlCents },
    customer_id: limits?.customerId,
    authorization_session_id: limits?.authorizationSessionId,
  }, `${sessionId}-open`);
}

export async function pollForAuthorizedPour(api: TotemAuthorizationApi) {
  return getAuthorizedPourSession(await api.getCommand());
}
