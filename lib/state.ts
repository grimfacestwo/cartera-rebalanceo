import type { AssetDef } from "@/lib/rebalance";

export type PortfolioValues = Record<string, string>;

export const CATEGORIES = [
  "alimentacion",
  "transporte",
  "vivienda",
  "ocio",
  "salud",
  "educacion",
  "suscripciones",
  "otros",
] as const;
export type CategoryId = (typeof CATEGORIES)[number];
export type CategoryLabel = Record<CategoryId, string>;
export type CategoryColor = Record<CategoryId, string>;

export const CATEGORY_LABELS: CategoryLabel = {
  alimentacion: "Alimentación",
  transporte: "Transporte",
  vivienda: "Vivienda",
  ocio: "Ocio",
  salud: "Salud",
  educacion: "Educación",
  suscripciones: "Suscripciones",
  otros: "Otros",
};

export const CATEGORY_COLORS: CategoryColor = {
  alimentacion: "#f97316",
  transporte: "#3b82f6",
  vivienda: "#8b5cf6",
  ocio: "#ec4899",
  salud: "#22c55e",
  educacion: "#06b6d4",
  suscripciones: "#eab308",
  otros: "#94a3b8",
};

export type Expense = {
  id: string;
  name: string;
  amount: string;
  type: "fijo" | "variable";
  bank: BankId | "";
  paid: boolean;
  category: CategoryId;
};

export type Goal = {
  id: string;
  name: string;
  target: string;
  current: string;
  deadline: string;
};

export const BANK_IDS = ["ing", "santander", "trade"] as const;
export type BankId = (typeof BANK_IDS)[number];

export const BANK_LABELS: Record<BankId, string> = {
  ing: "ING",
  santander: "Santander",
  trade: "Trade Republic",
};

export const BANK_COLORS: Record<BankId, string> = {
  ing: "#3b82f6",
  santander: "#ef4444",
  trade: "#8b5cf6",
};

export const DEFAULT_BANKS: Record<BankId, string> = {
  ing: "",
  santander: "",
  trade: "",
};

export type MonthData = {
  banks: Record<BankId, string>;
  expenses: Expense[];
  comidaDaily: string;
  comidaBank: BankId | "";
};

export type PortfolioState = {
  assets: AssetDef[];
  values: PortfolioValues;
  contribution: string;
  months: Record<string, MonthData>;
  goals: Goal[];
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
  months: {},
  goals: [],
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

// --- Month helpers ---

export function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function addMonth(key: string): string {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m) return currentMonthKey();
  if (m === 12) return `${y + 1}-01`;
  return `${y}-${String(m + 1).padStart(2, "0")}`;
}

export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m) return key;
  const d = new Date(y, m - 1, 1);
  const label = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric" }).format(d);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function sortMonthKeys(keys: string[]): string[] {
  return [...keys].sort();
}

export function bankRemaining(month: MonthData, bankId: BankId): number {
  const saldo = Number.parseFloat(month.banks[bankId]) || 0;
  const gastos = month.expenses
    .filter((e) => e.bank === bankId)
    .reduce((s, e) => s + (Number.parseFloat(e.amount) || 0), 0);
  return saldo - gastos;
}

export function daysInMonth(key: string): number {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m) return 30;
  return new Date(y, m, 0).getDate();
}

export function daysRemaining(key: string): number {
  const cur = currentMonthKey();
  const total = daysInMonth(key);
  if (key < cur) return 0;
  if (key === cur) return total - new Date().getDate() + 1;
  return total;
}

export function comidaAmount(month: MonthData, key: string): number {
  const rate = Number.parseFloat(month.comidaDaily) || 0;
  return rate * daysRemaining(key);
}

// --- Parsers ---

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
        const b = typeof o.bank === "string" && (BANK_IDS.includes(o.bank as BankId) || o.bank === "")
          ? (o.bank as BankId | "")
          : "ing";
        out.push({
          id: o.id,
          name: o.name,
          amount: typeof o.amount === "string" ? o.amount : "",
          type: t === "fijo" || t === "variable" ? t : "variable",
          bank: b,
          paid: o.paid === true,
          category: CATEGORIES.includes(o.category as CategoryId)
            ? (o.category as CategoryId)
            : "otros",
        });
      }
    }
  }
  return out;
}

export function parseGoals(raw: unknown): Goal[] {
  if (!Array.isArray(raw)) return [];
  const out: Goal[] = [];
  for (const item of raw) {
    if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      if (typeof o.id === "string" && typeof o.name === "string") {
        out.push({
          id: o.id,
          name: o.name,
          target: typeof o.target === "string" ? o.target : "",
          current: typeof o.current === "string" ? o.current : "",
          deadline: typeof o.deadline === "string" ? o.deadline : "",
        });
      }
    }
  }
  return out;
}

function parseMonthData(raw: unknown): MonthData | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  return {
    banks: parseBanks(o.banks),
    expenses: parseExpenses(o.expenses),
    comidaDaily: typeof o.comidaDaily === "string"
      ? o.comidaDaily
      : typeof o.comidaDaily === "number"
        ? String(o.comidaDaily)
        : "40",
    comidaBank: typeof o.comidaBank === "string" && (BANK_IDS.includes(o.comidaBank as BankId) || o.comidaBank === "")
      ? (o.comidaBank as BankId | "")
      : "ing",
  };
}

function parseMonths(raw: unknown): Record<string, MonthData> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, MonthData> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const parsed = parseMonthData(v);
    if (parsed) out[k] = parsed;
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

  let months = parseMonths(o.months);

  if (Object.keys(months).length === 0) {
    const legacyBanks = parseBanks(o.banks);
    const legacyExpenses = parseExpenses(o.expenses);
    const hasLegacy =
      Object.values(legacyBanks).some((v) => v !== "") || legacyExpenses.length > 0;
    if (hasLegacy) {
      months = {
        [currentMonthKey()]: {
          banks: legacyBanks,
          expenses: legacyExpenses,
          comidaDaily: "40",
          comidaBank: "ing",
        },
      };
    }
  }

  return {
    assets,
    values,
    contribution: typeof o.contribution === "string" ? o.contribution : "",
    months,
    goals: parseGoals(o.goals),
  };
}
