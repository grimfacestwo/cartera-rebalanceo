import type { AssetDef } from "@/lib/rebalance";

export type PortfolioValues = Record<string, string>;

export type Expense = {
  id: string;
  name: string;
  amount: string;
  type: "fijo" | "variable";
  paid: boolean;
};

export const BANK_IDS = ["ing", "santander", "trade"] as const;
export type BankId = (typeof BANK_IDS)[number];

export const BANK_LABELS: Record<BankId, string> = {
  ing: "ING",
  santander: "Santander",
  trade: "Trade Republic",
};

export const DEFAULT_BANKS: Record<BankId, string> = {
  ing: "",
  santander: "",
  trade: "",
};

export type PortfolioState = {
  assets: AssetDef[];
  values: PortfolioValues;
  contribution: string;
  banks: Record<BankId, string>;
  expenses: Expense[];
};

export const DEFAULT_ASSETS: AssetDef[] = [
  { id: "msci", name: "MSCI World", targetPct: 68, color: "#3b82f6" },
  { id: "oro", name: "Oro", targetPct: 25, color: "#f59e0b" },
  { id: "btc", name: "Bitcoin", targetPct: 6, color: "#f97316" },
];

export const DEFAULT_VALUES: PortfolioValues = {
  msci: "10000",
  oro: "2500",
  btc: "500",
};

export const DEFAULT_STATE: PortfolioState = {
  assets: DEFAULT_ASSETS,
  values: DEFAULT_VALUES,
  contribution: "",
  banks: { ...DEFAULT_BANKS },
  expenses: [],
};

export const PALETTE = [
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#84cc16",
  "#f43f5e",
  "#06b6d4",
  "#eab308",
  "#6366f1",
  "#d946ef",
  "#22c55e",
];

function parseAssets(raw: unknown): AssetDef[] {
  if (!Array.isArray(raw)) return DEFAULT_ASSETS;
  const out: AssetDef[] = [];
  for (const item of raw) {
    if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      if (typeof o.id === "string" && typeof o.name === "string") {
        out.push({
          id: o.id,
          name: o.name,
          targetPct: Number(o.targetPct) || 0,
          color: typeof o.color === "string" ? o.color : "#94a3b8",
        });
      }
    }
  }
  return out.length > 0 ? out : DEFAULT_ASSETS;
}

function parseValues(raw: unknown): PortfolioValues {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: PortfolioValues = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "number") out[k] = String(v);
    else if (typeof v === "string") out[k] = v;
  }
  return out;
}

function parseBanks(raw: unknown): Record<BankId, string> {
  const banks = { ...DEFAULT_BANKS };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return banks;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (BANK_IDS.includes(k as BankId)) {
      if (typeof v === "number") banks[k as BankId] = String(v);
      else if (typeof v === "string") banks[k as BankId] = v;
    }
  }
  return banks;
}

export function parseExpenses(raw: unknown): Expense[] {
  if (!Array.isArray(raw)) return [];
  const out: Expense[] = [];
  for (const item of raw) {
    if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      if (typeof o.id === "string" && typeof o.name === "string") {
        const t = o.type;
        out.push({
          id: o.id,
          name: o.name,
          amount: typeof o.amount === "string" ? o.amount : "",
          type: t === "fijo" || t === "variable" ? t : "variable",
          paid: o.paid === true,
        });
      }
    }
  }
  return out;
}

export function parseState(raw: unknown): PortfolioState {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...DEFAULT_STATE, values: { ...DEFAULT_VALUES } };
  }
  const o = raw as Record<string, unknown>;
  const assets = parseAssets(o.assets);
  const parsedValues = parseValues(o.values);
  const values: PortfolioValues = {};
  for (const a of assets) {
    values[a.id] = parsedValues[a.id] ?? DEFAULT_VALUES[a.id] ?? "";
  }
  return {
    assets,
    values,
    contribution: typeof o.contribution === "string" ? o.contribution : "",
    banks: parseBanks(o.banks),
    expenses: parseExpenses(o.expenses),
  };
}
