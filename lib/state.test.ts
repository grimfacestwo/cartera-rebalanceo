import { describe, expect, it } from "vitest";
import {
  addMonth,
  bankRemaining,
  comidaAmount,
  currentMonthKey,
  daysInMonth,
  daysRemaining,
  DEFAULT_ASSETS,
  DEFAULT_VALUES,
  monthBankTotal,
  monthLabel,
  netWorth,
  parseExpenses,
  parseGoals,
  parseState,
  projectGoal,
  sortMonthKeys,
} from "./state";

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
    expect(state.months).toEqual({});
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

  it("parsea months con banks y expenses", () => {
    const state = parseState({
      assets: DEFAULT_ASSETS,
      values: DEFAULT_VALUES,
      contribution: "",
      months: {
        "2026-08": {
          banks: { ing: "5000", santander: 3000, trade: "1000" },
          expenses: [
            { id: "e1", name: "Alquiler", amount: "800", type: "fijo", bank: "ing", paid: true },
          ],
        },
      },
    });
    expect(state.months["2026-08"]!.banks.ing).toBe("5000");
    expect(state.months["2026-08"]!.banks.santander).toBe("3000");
    expect(state.months["2026-08"]!.expenses).toHaveLength(1);
    expect(state.months["2026-08"]!.expenses[0].bank).toBe("ing");
  });

  it("devuelve months vacío si no hay datos", () => {
    const state = parseState(null);
    expect(state.months).toEqual({});
  });

  it("migra banks/expenses legacy al mes actual", () => {
    const legacy = {
      assets: DEFAULT_ASSETS,
      values: DEFAULT_VALUES,
      contribution: "",
      banks: { ing: "5000", santander: "3000", trade: "1000" },
      expenses: [
        { id: "e1", name: "Alquiler", amount: "800", type: "fijo", paid: false },
      ],
    };
    const state = parseState(legacy);
    const key = currentMonthKey();
    expect(state.months[key]).toBeDefined();
    expect(state.months[key]!.banks.ing).toBe("5000");
    expect(state.months[key]!.expenses).toHaveLength(1);
    expect(state.months[key]!.expenses[0].bank).toBe("ing");
  });
});

describe("parseExpenses", () => {
  it("parsea gastos válidos con bank", () => {
    const data = [
      { id: "e1", name: "Alquiler", amount: "800", type: "fijo", bank: "santander", paid: true },
      { id: "e2", name: "Gasolina", amount: "50", type: "variable", bank: "trade", paid: false },
    ];
    const result = parseExpenses(data);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ id: "e1", name: "Alquiler", amount: "800", type: "fijo", bank: "santander", paid: true, category: "otros", recurring: false });
    expect(result[1]).toEqual({ id: "e2", name: "Gasolina", amount: "50", type: "variable", bank: "trade", paid: false, category: "otros", recurring: false });
  });

  it("devuelve [] para datos inválidos", () => {
    expect(parseExpenses(null)).toEqual([]);
    expect(parseExpenses("mal")).toEqual([]);
    expect(parseExpenses(42)).toEqual([]);
  });

  it("filtra gastos con campos faltantes", () => {
    const data = [
      { id: "e1", name: "OK", amount: "10", type: "fijo", bank: "ing", paid: false },
      { name: "sin id", amount: "10", type: "fijo", bank: "ing", paid: false },
      { id: "e3", amount: "10", type: "fijo", bank: "ing", paid: false },
    ];
    const result = parseExpenses(data);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("e1");
  });

  it("defaulta tipo y bank inválidos", () => {
    const result = parseExpenses([{ id: "e1", name: "Test", amount: "10", type: "raro", bank: "bbva", paid: false }]);
    expect(result[0].type).toBe("variable");
    expect(result[0].bank).toBe("ing");
  });

  it("permite bank vacío (sin banco)", () => {
    const result = parseExpenses([{ id: "e1", name: "Test", amount: "10", type: "fijo", bank: "", paid: false }]);
    expect(result[0].bank).toBe("");
  });

  it("parsea paid=true y defaults a false si falta", () => {
    const result = parseExpenses([
      { id: "e1", name: "A", amount: "10", type: "fijo", bank: "ing", paid: true },
      { id: "e2", name: "B", amount: "10", type: "fijo", bank: "ing" },
    ]);
    expect(result[0].paid).toBe(true);
    expect(result[1].paid).toBe(false);
  });
});

describe("month helpers", () => {
  it("addMonth avanza de mes", () => {
    expect(addMonth("2026-08")).toBe("2026-09");
    expect(addMonth("2026-12")).toBe("2027-01");
  });

  it("monthLabel muestra nombre legible", () => {
    expect(monthLabel("2026-08")).toContain("Agosto");
    expect(monthLabel("2026-08")).toContain("2026");
    expect(monthLabel("2026-01")).toContain("Enero");
  });

  it("sortMonthKeys ordena ascendente", () => {
    expect(sortMonthKeys(["2026-09", "2026-08", "2026-10"])).toEqual(["2026-08", "2026-09", "2026-10"]);
  });

  it("bankRemaining calcula saldo − gastos", () => {
    const month = {
      banks: { ing: "1000", santander: "500", trade: "300" },
      expenses: [
        { id: "e1", name: "A", amount: "200", type: "fijo" as const, bank: "ing" as const, paid: false, category: "otros" as const, recurring: false },
        { id: "e2", name: "B", amount: "100", type: "variable" as const, bank: "ing" as const, paid: false, category: "otros" as const, recurring: false },
        { id: "e3", name: "C", amount: "50", type: "variable" as const, bank: "santander" as const, paid: true, category: "otros" as const, recurring: false },
      ],
      comidaDaily: "40",
      comidaBank: "ing" as const,
    };
    expect(bankRemaining(month, "ing")).toBe(700);
    expect(bankRemaining(month, "santander")).toBe(450);
    expect(bankRemaining(month, "trade")).toBe(300);
  });
});

describe("daysInMonth", () => {
  it("agosto 2026 tiene 31 días", () => {
    expect(daysInMonth("2026-08")).toBe(31);
  });

  it("febrero 2026 tiene 28 días (no bisiesto)", () => {
    expect(daysInMonth("2026-02")).toBe(28);
  });

  it("febrero 2028 tiene 29 días (bisiesto)", () => {
    expect(daysInMonth("2028-02")).toBe(29);
  });
});

describe("daysRemaining", () => {
  it("mes pasado devuelve 0", () => {
    expect(daysRemaining("2020-01")).toBe(0);
  });

  it("mes futuro devuelve días completos", () => {
    expect(daysRemaining("2999-01")).toBe(31);
    expect(daysRemaining("2999-02")).toBe(28);
  });

  it("mes actual devuelve entre 1 y díasDelMes (incluye hoy)", () => {
    const cur = currentMonthKey();
    const total = daysInMonth(cur);
    const r = daysRemaining(cur);
    expect(r).toBeGreaterThanOrEqual(1);
    expect(r).toBeLessThanOrEqual(total);
  });
});

describe("comidaAmount", () => {
  const month = {
    banks: { ing: "500", santander: "200", trade: "100" },
    expenses: [],
    comidaDaily: "40",
    comidaBank: "ing" as const,
  };

  it("mes futuro = 40 × díasDelMes", () => {
    const total = daysInMonth("2999-01");
    expect(comidaAmount(month, "2999-01")).toBe(40 * total);
  });

  it("mes pasado = 0", () => {
    expect(comidaAmount(month, "2020-01")).toBe(0);
  });

  it("mes actual = 40 × daysRemaining", () => {
    const cur = currentMonthKey();
    expect(comidaAmount(month, cur)).toBe(40 * daysRemaining(cur));
  });

  it("comidaDaily vacío = 0", () => {
    const empty = { ...month, comidaDaily: "" };
    expect(comidaAmount(empty, "2999-01")).toBe(0);
  });
});

describe("parseGoals", () => {
  it("devuelve [] si no es array", () => {
    expect(parseGoals(null)).toEqual([]);
    expect(parseGoals(undefined)).toEqual([]);
    expect(parseGoals("string")).toEqual([]);
    expect(parseGoals(42)).toEqual([]);
  });

  it("filtra items sin id o name", () => {
    const raw = [
      { id: "g1", name: "Viaje", target: "5000", current: "2000", deadline: "2026-12" },
      { id: "g2" },
      { name: "Sin id" },
      { id: 123, name: "Id numérico" },
    ];
    const goals = parseGoals(raw);
    expect(goals).toHaveLength(1);
    expect(goals[0].name).toBe("Viaje");
  });

  it("conserva strings y pone defaults para faltantes", () => {
    const raw = [{ id: "g1", name: "Fondo" }];
    const goals = parseGoals(raw);
    expect(goals[0]).toEqual({ id: "g1", name: "Fondo", target: "", current: "", deadline: "" });
  });

  it("parsea goals válidos", () => {
    const raw = [
      { id: "g1", name: "Viaje", target: "5000", current: "2000", deadline: "2026-12" },
      { id: "g2", name: "Coche", target: "15000", current: "8000", deadline: "" },
    ];
    const goals = parseGoals(raw);
    expect(goals).toHaveLength(2);
    expect(goals[1].name).toBe("Coche");
    expect(goals[1].deadline).toBe("");
  });

  it("parseState incluye goals por defecto", () => {
    const state = parseState({});
    expect(state.goals).toEqual([]);
  });

  it("parseState parsea goals proporcionados", () => {
    const state = parseState({
      goals: [{ id: "g1", name: "A", target: "100", current: "50", deadline: "" }],
    });
    expect(state.goals).toHaveLength(1);
    expect(state.goals[0].target).toBe("100");
  });

  it("parseState incluye netWorthHistory y monthlySavings por defecto", () => {
    const state = parseState({});
    expect(state.netWorthHistory).toEqual({});
    expect(state.monthlySavings).toBe("");
  });

  it("parseState parsea netWorthHistory y monthlySavings", () => {
    const state = parseState({
      netWorthHistory: { "2026-07": 15000, "2026-08": "16000" },
      monthlySavings: "500",
    });
    expect(state.netWorthHistory).toEqual({ "2026-07": 15000, "2026-08": 16000 });
    expect(state.monthlySavings).toBe("500");
  });

  it("parseState ignora netWorthHistory inválido", () => {
    const state = parseState({ netWorthHistory: "no" });
    expect(state.netWorthHistory).toEqual({});
  });
});

describe("monthBankTotal", () => {
  it("suma todos los saldos", () => {
    const m = { banks: { ing: "1000", santander: "500", trade: "300" }, expenses: [], comidaDaily: "0", comidaBank: "" as const };
    expect(monthBankTotal(m)).toBe(1800);
  });

  it("saldo vacío = 0", () => {
    const m = { banks: { ing: "", santander: "", trade: "" }, expenses: [], comidaDaily: "0", comidaBank: "" as const };
    expect(monthBankTotal(m)).toBe(0);
  });
});

describe("netWorth", () => {
  it("portfolio + banks", () => {
    const m = { banks: { ing: "500", santander: "300", trade: "200" }, expenses: [], comidaDaily: "0", comidaBank: "" as const };
    expect(netWorth(10000, m)).toBe(11000);
  });

  it("sin bancos = portfolio", () => {
    const m = { banks: { ing: "", santander: "", trade: "" }, expenses: [], comidaDaily: "0", comidaBank: "" as const };
    expect(netWorth(10000, m)).toBe(10000);
  });
});

describe("projectGoal", () => {
  const cur = currentMonthKey();

  it("ya alcanzado = 0 meses", () => {
    const g = { id: "g1", name: "A", target: "100", current: "100", deadline: "" };
    const r = projectGoal(g, 50);
    expect(r!.monthsToGoal).toBe(0);
  });

  it("calcula meses necesarios", () => {
    const g = { id: "g1", name: "A", target: "1000", current: "0", deadline: "" };
    const r = projectGoal(g, 200);
    expect(r!.monthsToGoal).toBe(5);
  });

  it("ahorro 0 = null months", () => {
    const g = { id: "g1", name: "A", target: "1000", current: "0", deadline: "" };
    const r = projectGoal(g, 0);
    expect(r!.monthsToGoal).toBe(0);
  });

  it("proyecta fecha correcta", () => {
    const g = { id: "g1", name: "A", target: "1000", current: "0", deadline: "" };
    const r = projectGoal(g, 200);
    expect(r!.projectedKey).toBe(addMonth(addMonth(addMonth(addMonth(addMonth(cur))))));
  });
});
