export type HogarUiPrefs = {
  mensualidadCollapsed: boolean;
};

export const DEFAULT_HOGAR_UI_PREFS: HogarUiPrefs = { mensualidadCollapsed: false };

export function parseHogarUiPrefs(raw: unknown): HogarUiPrefs {
  const prefs = { ...DEFAULT_HOGAR_UI_PREFS };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return prefs;
  const r = raw as Record<string, unknown>;
  if (typeof r.mensualidadCollapsed === "boolean") prefs.mensualidadCollapsed = r.mensualidadCollapsed;
  return prefs;
}
