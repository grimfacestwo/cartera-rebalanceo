import { BANK_IDS, CATEGORIES, type BankId, type CategoryId } from "./state";

const PAID_FILTERS = ["all", "paid", "pending"] as const;
type PaidFilter = (typeof PAID_FILTERS)[number];

export type HogarUiPrefs = {
  mensualidadCollapsed: boolean;
  pastMonthsHidden: boolean;
  defaultBankFilter: BankId | "all";
  defaultPaidFilter: PaidFilter;
  collapsedCategories: CategoryId[];
};

export const DEFAULT_HOGAR_UI_PREFS: HogarUiPrefs = {
  mensualidadCollapsed: false,
  pastMonthsHidden: true,
  defaultBankFilter: "all",
  defaultPaidFilter: "all",
  collapsedCategories: [],
};

export function parseHogarUiPrefs(raw: unknown): HogarUiPrefs {
  const prefs = { ...DEFAULT_HOGAR_UI_PREFS };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return prefs;
  const r = raw as Record<string, unknown>;
  if (typeof r.mensualidadCollapsed === "boolean") prefs.mensualidadCollapsed = r.mensualidadCollapsed;
  if (typeof r.pastMonthsHidden === "boolean") prefs.pastMonthsHidden = r.pastMonthsHidden;
  if (typeof r.defaultBankFilter === "string" && (r.defaultBankFilter === "all" || BANK_IDS.includes(r.defaultBankFilter as BankId))) {
    prefs.defaultBankFilter = r.defaultBankFilter as BankId | "all";
  }
  if (typeof r.defaultPaidFilter === "string" && PAID_FILTERS.includes(r.defaultPaidFilter as PaidFilter)) {
    prefs.defaultPaidFilter = r.defaultPaidFilter as PaidFilter;
  }
  if (Array.isArray(r.collapsedCategories)) {
    prefs.collapsedCategories = r.collapsedCategories.filter(
      (c): c is CategoryId => typeof c === "string" && CATEGORIES.includes(c as CategoryId),
    );
  }
  return prefs;
}
