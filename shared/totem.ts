export const TOTEM_ID = "TOTEM_001";
export const TAP_ID = "TORNEIRA_01";

export type TotemState =
  | "idle"
  | "authenticating"
  | "product_selection"
  | "cup_selection"
  | "confirming"
  | "authorized"
  | "pouring"
  | "finishing"
  | "completed"
  | "offline"
  | "error";

export type Product = {
  id: string;
  name: string;
  description: string;
  brewery: string;
  style: string;
  abv: string;
  ibu: string;
  pricePer100mlCents: number;
  accent: string;
};

export type TapCommand = {
  type: "start_pour" | "close" | "emergency_stop";
  session_id?: string;
  max_volume_ml?: number;
  max_value_cents?: number;
  product?: {
    name: string;
    price_per_100ml_cents: number;
  };
};

export const PRODUCTS: Product[] = [
  {
    id: "brahma-lager",
    name: "Brahma",
    description: "American Lager leve e refrescante, servida na torneira do Totem.",
    brewery: "Ambev",
    style: "American Lager",
    abv: "2,5%",
    ibu: "14",
    pricePer100mlCents: 160,
    accent: "#d9a441",
  },
  {
    id: "maverick-pilsen",
    name: "Maverick Pilsen",
    description: "Leve, dourada e criada para servir gelada no ponto certo.",
    brewery: "Maverick Smart Chopp",
    style: "Pilsen",
    abv: "4,6%",
    ibu: "17",
    pricePer100mlCents: 179,
    accent: "#d7a43c",
  },
  {
    id: "maverick-ipa",
    name: "Maverick IPA",
    description: "Notas cítricas e aroma intenso para uma experiência marcante.",
    brewery: "Maverick Smart Chopp",
    style: "Session IPA",
    abv: "5,4%",
    ibu: "38",
    pricePer100mlCents: 229,
    accent: "#ec8c38",
  },
];

export const CUP_SIZES = [200, 300, 400, 500] as const;

const transitions: Record<TotemState, TotemState[]> = {
  idle: ["authenticating", "offline", "error"],
  authenticating: ["idle", "product_selection", "offline", "error"],
  product_selection: ["authenticating", "cup_selection", "idle", "error"],
  cup_selection: ["product_selection", "confirming", "idle", "error"],
  confirming: ["cup_selection", "authorized", "offline", "error"],
  authorized: ["pouring", "offline", "error"],
  pouring: ["finishing", "offline", "error"],
  finishing: ["completed", "offline", "error"],
  completed: ["idle"],
  offline: ["idle", "error"],
  error: ["idle", "offline"],
};

export function canTransition(from: TotemState, to: TotemState) {
  return transitions[from].includes(to);
}

export function calculateValueCents(volumeMl: number, pricePer100mlCents: number) {
  if (volumeMl < 10) return 0;
  return Math.round((volumeMl / 100) * pricePer100mlCents);
}

export function formatCurrency(valueCents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(valueCents / 100);
}

export function createNonce() {
  const values = new Uint8Array(12);
  crypto.getRandomValues(values);
  return Array.from(values, byte => byte.toString(16).padStart(2, "0")).join("");
}

export function createSessionId() {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `sess-${createNonce()}-${Date.now()}`;
}
