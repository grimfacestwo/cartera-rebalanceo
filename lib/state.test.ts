import { describe, expect, it } from "vitest";
import { DEFAULT_ASSETS, DEFAULT_VALUES, parseExpenses, parseState } from "./state";

describe("parseState", () => {
  it("devuelve el estado si es válido", () => {
    const state = parseState({
      assets: [{ id: "a", name: "Activo", targetPct: 50, color: "#fff" }],
      values: { a: "123" },
      contribution: "10",
    });
    expect(state.assets).toEqual([{ id: "a", name: "Activo", targetPct: 50, color: "#fff" }]);
    expect(state.values).toEqual({ a: "123" });
    expect(state.contribution).toBe("10");
  });

  it("convierte valores numéricos a string y conserva el resto por defecto", () => {
    const state = parseState({ assets: DEFAULT_ASSETS, values: { msci: 42 }, contribution: "" });
    expect(state.values).toEqual({ msci: "42", oro: "2500", btc: "500" });
  });

  it("usa los activos por defecto si el array no es válido", () => {
    const state = parseState({ assets: "mal", values: {}, contribution: "" });
    expect(state.assets).toEqual(DEFAULT_ASSETS);
  });

  it("rellena valores vacíos con los por defecto por id de activo", () => {
    const state = parseState({ assets: DEFAULT_ASSETS, values: {}, contribution: "" });
    for (const a of DEFAULT_ASSETS) {
      expect(state.values[a.id]).toBe(DEFAULT_VALUES[a.id]);
    }
  });

  it("ignora datos inválidos", () => {
    const state = parseState(null);
    expect(state.assets).toEqual(DEFAULT_ASSETS);
    expect(state.values.msci).toBe(DEFAULT_VALUES.msci);
    expect(state.contribution).toBe("");
  });

  it("no incluye claves de activos desconocidos si ya hay datos", () => {
    const state = parseState({
      assets: [{ id: "x", name: "X", targetPct: 100, color: "#111" }],
      values: { msci: "9" },
      contribution: "",
    });
    expect(state.assets).toEqual([{ id: "x", name: "X", targetPct: 100, color: "#111" }]);
    expect(state.values.msci).toBeUndefined();
  });

  it("parsea banks con saldos válidos", () => {
    const state = parseState({
      assets: DEFAULT_ASSETS,
      values: DEFAULT_VALUES,
      contribution: "",
      banks: { ing: "5000", santander: 3000, trade: "" },
    });
    expect(state.banks.ing).toBe("5000");
    expect(state.banks.santander).toBe("3000");
    expect(state.banks.trade).toBe("");
  });

  it("devuelve banks vacíos por defecto si no hay datos", () => {
    const state = parseState(null);
    expect(state.banks).toEqual({ ing: "", santander: "", trade: "" });
  });

  it("ignora bancos desconocidos en banks", () => {
    const state = parseState({
      assets: DEFAULT_ASSETS,
      values: DEFAULT_VALUES,
      contribution: "",
      banks: { ing: "100", bbva: "200" },
    });
    expect(state.banks.ing).toBe("100");
    expect(state.banks).not.toHaveProperty("bbva");
  });
});

describe("parseExpenses", () => {
  it("parsea gastos válidos", () => {
    const data = [
      { id: "e1", name: "Alquiler", amount: "800", type: "fijo", paid: true },
      { id: "e2", name: "Gasolina", amount: "50", type: "variable", paid: false },
    ];
    const result = parseExpenses(data);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ id: "e1", name: "Alquiler", amount: "800", type: "fijo", paid: true });
    expect(result[1]).toEqual({ id: "e2", name: "Gasolina", amount: "50", type: "variable", paid: false });
  });

  it("devuelve [] para datos inválidos", () => {
    expect(parseExpenses(null)).toEqual([]);
    expect(parseExpenses("mal")).toEqual([]);
    expect(parseExpenses(42)).toEqual([]);
  });

  it("filtra gastos con campos faltantes", () => {
    const data = [
      { id: "e1", name: "OK", amount: "10", type: "fijo", paid: false },
      { name: "sin id", amount: "10", type: "fijo", paid: false },
      { id: "e3", amount: "10", type: "fijo", paid: false },
    ];
    const result = parseExpenses(data);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("e1");
  });

  it("defaulta tipo inválido a variable", () => {
    const result = parseExpenses([{ id: "e1", name: "Test", amount: "10", type: "raro", paid: false }]);
    expect(result[0].type).toBe("variable");
  });

  it("parsea paid=true y defaults a false si falta", () => {
    const result = parseExpenses([
      { id: "e1", name: "A", amount: "10", type: "fijo", paid: true },
      { id: "e2", name: "B", amount: "10", type: "fijo" },
    ]);
    expect(result[0].paid).toBe(true);
    expect(result[1].paid).toBe(false);
  });
});
