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

  it("reconoce mensualidadCollapsed y pastMonthsHidden true/false", () => {
    expect(parseHogarUiPrefs({ mensualidadCollapsed: true, pastMonthsHidden: false })).toEqual({
      ...DEFAULT_HOGAR_UI_PREFS,
      mensualidadCollapsed: true,
      pastMonthsHidden: false,
    });
    expect(parseHogarUiPrefs({ mensualidadCollapsed: false, pastMonthsHidden: true })).toEqual(DEFAULT_HOGAR_UI_PREFS);
  });

  it("ignora campos con tipo inesperado y campos extra", () => {
    expect(parseHogarUiPrefs({ mensualidadCollapsed: "true" })).toEqual(DEFAULT_HOGAR_UI_PREFS);
    expect(parseHogarUiPrefs({ pastMonthsHidden: "false" })).toEqual(DEFAULT_HOGAR_UI_PREFS);
    expect(parseHogarUiPrefs({ mensualidadCollapsed: true, otro: "x" })).toEqual({
      ...DEFAULT_HOGAR_UI_PREFS,
      mensualidadCollapsed: true,
    });
  });

  it("reconoce defaultBankFilter válido y descarta valores desconocidos", () => {
    expect(parseHogarUiPrefs({ defaultBankFilter: "trade" })).toEqual({
      ...DEFAULT_HOGAR_UI_PREFS,
      defaultBankFilter: "trade",
    });
    expect(parseHogarUiPrefs({ defaultBankFilter: "all" })).toEqual(DEFAULT_HOGAR_UI_PREFS);
    expect(parseHogarUiPrefs({ defaultBankFilter: "bitcoin" })).toEqual(DEFAULT_HOGAR_UI_PREFS);
    expect(parseHogarUiPrefs({ defaultBankFilter: 123 })).toEqual(DEFAULT_HOGAR_UI_PREFS);
  });

  it("reconoce defaultPaidFilter válido y descarta valores desconocidos", () => {
    expect(parseHogarUiPrefs({ defaultPaidFilter: "pending" })).toEqual({
      ...DEFAULT_HOGAR_UI_PREFS,
      defaultPaidFilter: "pending",
    });
    expect(parseHogarUiPrefs({ defaultPaidFilter: "paid" })).toEqual({
      ...DEFAULT_HOGAR_UI_PREFS,
      defaultPaidFilter: "paid",
    });
    expect(parseHogarUiPrefs({ defaultPaidFilter: "vencido" })).toEqual(DEFAULT_HOGAR_UI_PREFS);
  });

  it("filtra collapsedCategories a valores válidos", () => {
    expect(parseHogarUiPrefs({ collapsedCategories: ["gastos", "disfrute"] })).toEqual({
      ...DEFAULT_HOGAR_UI_PREFS,
      collapsedCategories: ["gastos", "disfrute"],
    });
    expect(parseHogarUiPrefs({ collapsedCategories: ["gastos", "inventado", 42, null] })).toEqual({
      ...DEFAULT_HOGAR_UI_PREFS,
      collapsedCategories: ["gastos"],
    });
    expect(parseHogarUiPrefs({ collapsedCategories: "gastos" })).toEqual(DEFAULT_HOGAR_UI_PREFS);
  });
});
