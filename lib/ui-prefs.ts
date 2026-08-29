export type UiPrefs = {
  sidebar: boolean;
  dark: boolean;
};

export const DEFAULT_UI_PREFS: UiPrefs = { sidebar: false, dark: false };

export function parseUiPrefs(raw: unknown): UiPrefs {
  const prefs = { ...DEFAULT_UI_PREFS };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return prefs;
  const r = raw as Record<string, unknown>;
  if (typeof r.sidebar === "boolean") prefs.sidebar = r.sidebar;
  if (typeof r.dark === "boolean") prefs.dark = r.dark;
  return prefs;
}
