import type { AssetDef } from "@/lib/rebalance";

export type PortfolioValues = Record<string, string>;

export type PortfolioState = {
  assets: AssetDef[];
  values: PortfolioValues;
  contribution: string;
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
  };
}