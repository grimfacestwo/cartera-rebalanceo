import { describe, expect, it } from "vitest";
import { DEFAULT_ASSETS, DEFAULT_VALUES, parseState } from "./state";

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
});
