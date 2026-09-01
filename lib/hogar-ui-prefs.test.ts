import { describe, expect, it } from "vitest";
import { DEFAULT_HOGAR_UI_PREFS, parseHogarUiPrefs } from "./hogar-ui-prefs";

describe("parseHogarUiPrefs", () => {
  it("devuelve el default para valores inválidos", () => {
    expect(parseHogarUiPrefs(null)).toEqual(DEFAULT_HOGAR_UI_PREFS);
    expect(parseHogarUiPrefs(undefined)).toEqual(DEFAULT_HOGAR_UI_PREFS);
    expect(parseHogarUiPrefs("foo")).toEqual(DEFAULT_HOGAR_UI_PREFS);
    expect(parseHogarUiPrefs([])).toEqual(DEFAULT_HOGAR_UI_PREFS);
    expect(parseHogarUiPrefs(42)).toEqual(DEFAULT_HOGAR_UI_PREFS);
  });

  it("reconoce mensualidadCollapsed true/false", () => {
    expect(parseHogarUiPrefs({ mensualidadCollapsed: true })).toEqual({ mensualidadCollapsed: true });
    expect(parseHogarUiPrefs({ mensualidadCollapsed: false })).toEqual({ mensualidadCollapsed: false });
  });

  it("ignora campos con tipo inesperado y campos extra", () => {
    expect(parseHogarUiPrefs({ mensualidadCollapsed: "true" })).toEqual(DEFAULT_HOGAR_UI_PREFS);
    expect(parseHogarUiPrefs({ mensualidadCollapsed: true, otro: "x" })).toEqual({ mensualidadCollapsed: true });
  });
});
