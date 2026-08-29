import type { AssetDef } from "@/lib/rebalance";

export type PortfolioValues = Record<string, string>;

export const CATEGORIES = [
  "inversion",
  "gastos",
  "crecimiento",
  "disfrute",
] as const;
export type CategoryId = (typeof CATEGORIES)[number];
export type CategoryLabel = Record<CategoryId, string>;
export type CategoryColor = Record<CategoryId, string>;

export const CATEGORY_LABELS: CategoryLabel = {
  inversion: "Inversión",
  gastos: "Gastos",
  crecimiento: "Crecimiento",
  disfrute: "Disfrute",
};

export const CATEGORY_COLORS: CategoryColor = {
  inversion: "#3b82f6",
  gastos: "#f97316",
  crecimiento: "#22c55e",
  disfrute: "#ec4899",
};

export type Expense = {
  id: string;
  name: string;
  amount: string;
  type: "fijo" | "variable";
  bank: BankId | "";
  paid: boolean;
  category: CategoryId;
  recurring: boolean;
  daily?: boolean;
};

export type Goal = {
  id: string;
  name: string;
  target: string;
  current: string;
  bank: BankId | "";
  rate: string;
  notes: string;
};

export type FixedExpense = {
  id: string;
  name: string;
  amount: string;
  bank: BankId | "";
  category: CategoryId;
  daily?: boolean;
};

export type CategoryRule = {
  id: string;
  match: string;
  category: CategoryId;
};

export const DEFAULT_FIXED_EXPENSES: FixedExpense[] = [
  { id: "hipoteca", name: "Hipoteca", amount: "672.80", bank: "", category: "gastos", daily: false },
  { id: "digi", name: "Digi", amount: "28", bank: "", category: "gastos", daily: false },
  { id: "comunidad", name: "Comunidad", amount: "55.60", bank: "", category: "gastos", daily: false },
  { id: "combustible", name: "Combustible", amount: "120", bank: "", category: "gastos", daily: false },
  { id: "primitiva", name: "Primitiva", amount: "60", bank: "", category: "disfrute", daily: false },
  { id: "gym", name: "Gym", amount: "75", bank: "", category: "disfrute", daily: false },
  { id: "sharesub", name: "Sharesub", amount: "30", bank: "", category: "gastos", daily: false },
  { id: "ahorro", name: "Ahorro", amount: "70", bank: "", category: "inversion", daily: false },
  { id: "finanzas", name: "Finanzas", amount: "60", bank: "", category: "inversion", daily: false },
  { id: "aportacion", name: "Aportacion", amount: "90", bank: "", category: "inversion", daily: false },
  { id: "comedor", name: "Comedor", amount: "180", bank: "", category: "gastos", daily: false },
  { id: "comida", name: "Comida", amount: "40", bank: "ing", category: "gastos", daily: true },
];

export const PLAN_TARGETS_DEFAULT: Record<CategoryId, string> = {
  inversion: "15",
  gastos: "70",
  crecimiento: "5",
  disfrute: "10",
};

export const BANK_IDS = ["ing", "santander", "trade"] as const;
export type BankId = (typeof BANK_IDS)[number];

export const BANK_LABELS: Record<BankId, string> = {
  ing: "ING",
  santander: "Santander",
  trade: "Trade Republic",
};

export const BANK_COLORS: Record<BankId, string> = {
  ing: "#f97316",
  santander: "#ef4444",
  trade: "#94a3b8",
};

export const DEFAULT_BANKS: Record<BankId, string> = {
  ing: "",
  santander: "",
  trade: "",
};

export type MonthData = {
  banks: Record<BankId, string>;
  expenses: Expense[];
  fixed: Expense[];
};

export type PortfolioState = {
  assets: AssetDef[];
  values: PortfolioValues;
  contribution: string;
  months: Record<string, MonthData>;
  goals: Goal[];
  fixedExpenses: FixedExpense[];
  catRules: CategoryRule[];
  planTargets: Record<string, string>;
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
  fixedExpenses: DEFAULT_FIXED_EXPENSES,
  catRules: [],
  planTargets: { ...PLAN_TARGETS_DEFAULT },
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

const monthFmt = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric" });

export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m) return key;
  const d = new Date(y, m - 1, 1);
  const label = monthFmt.format(d);
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

export function effectiveAmount(e: Expense, days: number): number {
  const base = Number.parseFloat(e.amount) || 0;
  return e.daily ? base * days : base;
}

export function matchCategory(name: string, rules: CategoryRule[]): CategoryId | undefined {
  const n = name.trim().toLowerCase();
  if (!n) return undefined;
  for (const r of rules) {
    const m = r.match.trim().toLowerCase();
    if (m && n.includes(m) && CATEGORIES.includes(r.category as CategoryId)) {
      return r.category;
    }
  }
  return undefined;
}

export function categoryTotals(month: MonthData | undefined, days?: number): Record<string, number> {
  const stats: Record<string, number> = {};
  if (!month) return stats;
  for (const e of [...month.fixed, ...month.expenses]) {
    const amt = days !== undefined ? effectiveAmount(e, days) : Number.parseFloat(e.amount) || 0;
    stats[e.category] = (stats[e.category] || 0) + amt;
  }
  return stats;
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
  const out = Object.create(null) as PortfolioValues;
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
            : "gastos",
          recurring: o.recurring === true,
          ...(o.daily === true ? { daily: true } : {}),
        });
      }
    }
  }
  return out;
}

export function parseFixedExpenses(raw: unknown): FixedExpense[] {
  if (!Array.isArray(raw)) return [];
  const out: FixedExpense[] = [];
  for (const item of raw) {
    if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      if (typeof o.id === "string" && typeof o.name === "string") {
        out.push({
          id: o.id,
          name: o.name,
          amount: typeof o.amount === "string" ? o.amount : "",
          bank: typeof o.bank === "string" && (BANK_IDS.includes(o.bank as BankId) || o.bank === "")
            ? (o.bank as BankId | "")
            : "",
          category: CATEGORIES.includes(o.category as CategoryId)
            ? (o.category as CategoryId)
            : "gastos",
          ...(o.daily === true ? { daily: true } : {}),
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
          bank: typeof o.bank === "string" && (BANK_IDS.includes(o.bank as BankId) || o.bank === "")
            ? (o.bank as BankId | "")
            : "",
          rate: typeof o.rate === "string" ? o.rate : "",
          notes: typeof o.notes === "string" ? o.notes : "",
        });
      }
    }
  }
  return out;
}

export function parseCatRules(raw: unknown): CategoryRule[] {
  if (!Array.isArray(raw)) return [];
  const out: CategoryRule[] = [];
  for (const item of raw) {
    if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      if (
        typeof o.id === "string" &&
        typeof o.match === "string" &&
        CATEGORIES.includes(o.category as CategoryId)
      ) {
        out.push({ id: o.id, match: o.match, category: o.category as CategoryId });
      }
    }
  }
  return out;
}

export function parsePlanTargets(raw: unknown): Record<string, string> {
  const out: Record<string, string> = { ...PLAN_TARGETS_DEFAULT };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (CATEGORIES.includes(k as CategoryId)) {
      out[k as CategoryId] =
        typeof v === "number" ? String(v) : typeof v === "string" ? v : out[k as CategoryId];
    }
  }
  return out;
}

function parseMonthData(raw: unknown): MonthData | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const fixed = parseExpenses(o.fixed);
  const fixedIds = new Set(fixed.map((e) => e.id));
  const legacyComidaDaily = typeof o.comidaDaily === "string"
    ? o.comidaDaily
    : typeof o.comidaDaily === "number"
      ? String(o.comidaDaily)
      : "";
  const legacyComidaBank = typeof o.comidaBank === "string" && (BANK_IDS.includes(o.comidaBank as BankId) || o.comidaBank === "")
    ? (o.comidaBank as BankId | "")
    : "ing";
  const migrated: Expense[] = [];
  if (legacyComidaDaily !== "" && !fixedIds.has("comida")) {
    migrated.push({
      id: "comida",
      name: "Comida",
      amount: legacyComidaDaily,
      type: "fijo",
      bank: legacyComidaBank,
      paid: false,
      category: "gastos",
      recurring: true,
      daily: true,
    });
  }
  return {
    banks: parseBanks(o.banks),
    expenses: parseExpenses(o.expenses),
    fixed: [...fixed, ...migrated],
  };
}

function parseMonths(raw: unknown): Record<string, MonthData> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out = Object.create(null) as Record<string, MonthData>;
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
          fixed: [],
        },
      };
    }
  }

  const fixedExpenses = o.fixedExpenses !== undefined ? parseFixedExpenses(o.fixedExpenses) : DEFAULT_FIXED_EXPENSES;
  const tmpl = fixedExpenses.length > 0 ? fixedExpenses : DEFAULT_FIXED_EXPENSES;

  for (const key of Object.keys(months)) {
    const m = months[key];
    const present = new Set(m.fixed.map((e) => e.id));
    const seeded = [...m.fixed];
    for (const f of tmpl) {
      if (!present.has(f.id)) {
        seeded.push({ id: f.id, name: f.name, amount: f.amount, type: "fijo", bank: f.bank, paid: false, category: f.category, recurring: true, daily: f.daily });
      }
    }
    months[key] = { ...m, fixed: seeded };
  }

  return {
    assets,
    values,
    contribution: typeof o.contribution === "string" ? o.contribution : "",
    months,
    goals: parseGoals(o.goals),
    fixedExpenses,
    catRules: parseCatRules(o.catRules),
    planTargets: parsePlanTargets(o.planTargets),
  };
}
