export type HogarUiPrefs = {
  mensualidadCollapsed: boolean;
  pastMonthsHidden: boolean;
};

export const DEFAULT_HOGAR_UI_PREFS: HogarUiPrefs = {
  mensualidadCollapsed: false,
  pastMonthsHidden: true,
};

export function parseHogarUiPrefs(raw: unknown): HogarUiPrefs {
  const prefs = { ...DEFAULT_HOGAR_UI_PREFS };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return prefs;
  const r = raw as Record<string, unknown>;
  if (typeof r.mensualidadCollapsed === "boolean") prefs.mensualidadCollapsed = r.mensualidadCollapsed;
  if (typeof r.pastMonthsHidden === "boolean") prefs.pastMonthsHidden = r.pastMonthsHidden;
  return prefs;
}
