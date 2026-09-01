import { describe, expect, it } from "vitest";
import {
  addMonth,
  bankRemaining,
  categoryTotals,
  currentMonthKey,
  computeDisponible,
  daysInMonth,
  daysRemaining,
  DEFAULT_ASSETS,
  DEFAULT_VALUES,
  effectiveAmount,
  emergencyFundAmount,
  expenseAppliesToMonth,
  matchCategory,
  monthLabel,
  monthShortLabel,
  parseCatRules,
  parseExpenses,
  parseFixedExpenses,
  parseGoals,
  parsePlanTargets,
  parseState,
  PLAN_TARGETS_DEFAULT,
  sortMonthKeys,
  type Goal,
  type MonthData,
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
    expect(result[0]).toEqual({ id: "e1", name: "Alquiler", amount: "800", type: "fijo", bank: "santander", paid: true, category: "gastos", recurring: false });
    expect(result[1]).toEqual({ id: "e2", name: "Gasolina", amount: "50", type: "variable", bank: "trade", paid: false, category: "gastos", recurring: false });
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

  it("monthShortLabel abrevia mes + año de 2 dígitos", () => {
    expect(monthShortLabel("2026-08")).toBe("Ago 26");
    expect(monthShortLabel("2027-01")).toBe("Ene 27");
  });

  it("sortMonthKeys ordena ascendente", () => {
    expect(sortMonthKeys(["2026-09", "2026-08", "2026-10"])).toEqual(["2026-08", "2026-09", "2026-10"]);
  });

  it("bankRemaining calcula saldo − gastos", () => {
    const month = {
      banks: { ing: "1000", santander: "500", trade: "300" },
      expenses: [
        { id: "e1", name: "A", amount: "200", type: "fijo" as const, bank: "ing" as const, paid: false, category: "gastos" as const, recurring: false },
        { id: "e2", name: "B", amount: "100", type: "variable" as const, bank: "ing" as const, paid: false, category: "gastos" as const, recurring: false },
        { id: "e3", name: "C", amount: "50", type: "variable" as const, bank: "santander" as const, paid: true, category: "gastos" as const, recurring: false },
      ],
      fixed: [],
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

describe("effectiveAmount", () => {
  const comida = { id: "c", name: "Comida", amount: "40", type: "fijo" as const, bank: "ing" as const, paid: false, category: "gastos" as const, recurring: true, daily: true };

  it("gasto diario = tarifa × días", () => {
    expect(effectiveAmount(comida, 31)).toBe(1240);
  });

  it("gasto no diario = importe", () => {
    expect(effectiveAmount({ ...comida, daily: false }, 31)).toBe(40);
  });
});

describe("expenseAppliesToMonth", () => {
  const base = { id: "c", name: "Seguro", amount: "40", type: "fijo" as const, bank: "ing" as const, paid: false, category: "gastos" as const, recurring: true };

  it("sin mensualidad (mensual) aplica a cualquier mes", () => {
    expect(expenseAppliesToMonth(base, "2026-01")).toBe(true);
    expect(expenseAppliesToMonth(base, "2026-08")).toBe(true);
  });

  it("con mensualidad personalizada solo aplica a los meses listados", () => {
    const seguro = { ...base, months: "1,7" };
    expect(expenseAppliesToMonth(seguro, "2026-01")).toBe(true);
    expect(expenseAppliesToMonth(seguro, "2026-07")).toBe(true);
    expect(expenseAppliesToMonth(seguro, "2026-08")).toBe(false);
  });
});

describe("categoryTotals con gastos diarios", () => {
  const month = {
    banks: { ing: "500", santander: "200", trade: "100" },
    expenses: [],
    fixed: [{ id: "c", name: "Comida", amount: "40", type: "fijo" as const, bank: "ing" as const, paid: false, category: "gastos" as const, recurring: true, daily: true }],
  };

  it("sin días usa el importe base", () => {
    expect(categoryTotals(month).gastos).toBe(40);
  });

  it("con días aplica el cálculo diario", () => {
    expect(categoryTotals(month, 31).gastos).toBe(1240);
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
      { id: "g1", name: "Viaje", target: "5000", current: "2000", bank: "ing", rate: "3.5" },
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
    expect(goals[0]).toEqual({ id: "g1", name: "Fondo", target: "", current: "", bank: "", rate: "", notes: "" });
  });

  it("parsea goals válidos", () => {
    const raw = [
      { id: "g1", name: "Viaje", target: "5000", current: "2000", bank: "ing", rate: "3.5" },
      { id: "g2", name: "Coche", target: "15000", current: "8000", bank: "", rate: "" },
    ];
    const goals = parseGoals(raw);
    expect(goals).toHaveLength(2);
    expect(goals[1].name).toBe("Coche");
    expect(goals[1].bank).toBe("");
    expect(goals[1].rate).toBe("");
  });

  it("parseState incluye goals por defecto", () => {
    const state = parseState({});
    expect(state.goals).toEqual([]);
  });

  it("parseState parsea goals proporcionados", () => {
    const state = parseState({
      goals: [{ id: "g1", name: "A", target: "100", current: "50", bank: "", rate: "" }],
    });
    expect(state.goals).toHaveLength(1);
    expect(state.goals[0].target).toBe("100");
  });
});

describe("parseFixedExpenses", () => {
  it("devuelve [] si no es array", () => {
    expect(parseFixedExpenses(null)).toEqual([]);
    expect(parseFixedExpenses("mal")).toEqual([]);
  });

  it("parsea con defaults para campos faltantes", () => {
    const raw = [{ id: "f1", name: "Hipoteca", amount: "672.80" }];
    const out = parseFixedExpenses(raw);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({ id: "f1", name: "Hipoteca", amount: "672.80", bank: "", category: "gastos" });
  });

  it("respeta banco y categoría", () => {
    const raw = [{ id: "f1", name: "Luz", amount: "50", bank: "ing", category: "gastos" }];
    const out = parseFixedExpenses(raw);
    expect(out[0].bank).toBe("ing");
    expect(out[0].category).toBe("gastos");
  });
});

describe("parseState + gastos fijos", () => {
  it("incluye fixedExpenses por defecto", () => {
    const state = parseState({});
    expect(state.fixedExpenses.length).toBeGreaterThan(0);
    expect(state.fixedExpenses[0].name).toBe("Hipoteca");
  });

  it("sema cada mes con los fijos de la plantilla", () => {
    const state = parseState({
      fixedExpenses: [{ id: "luz", name: "Luz", amount: "50", bank: "", category: "vivienda" }],
      months: { "2026-08": { banks: { ing: "0", santander: "0", trade: "0" }, expenses: [], fixed: [] } },
    });
    const m = state.months["2026-08"];
    expect(m.fixed).toHaveLength(1);
    expect(m.fixed[0].id).toBe("luz");
    expect(m.fixed[0].amount).toBe("50");
  });

  it("no duplica fijos ya presentes en el mes", () => {
    const state = parseState({
      fixedExpenses: [{ id: "luz", name: "Luz", amount: "50", bank: "", category: "vivienda" }],
      months: { "2026-08": { banks: { ing: "0", santander: "0", trade: "0" }, expenses: [], fixed: [{ id: "luz", name: "Luz", amount: "99", type: "fijo", bank: "", paid: false, category: "vivienda", recurring: true }] } },
    });
    expect(state.months["2026-08"].fixed).toHaveLength(1);
    expect(state.months["2026-08"].fixed[0].amount).toBe("99");
  });

  it("migra comidaDaily legacy a gasto fijo diario", () => {
    const state = parseState({
      months: { "2026-08": { banks: { ing: "0", santander: "0", trade: "0" }, expenses: [], fixed: [], comidaDaily: "40", comidaBank: "ing" } },
    });
    const comida = state.months["2026-08"].fixed.find((e) => e.id === "comida");
    expect(comida).toBeDefined();
    expect(comida?.daily).toBe(true);
    expect(comida?.amount).toBe("40");
    expect(comida?.bank).toBe("ing");
    expect(comida?.category).toBe("gastos");
  });
});

describe("categoryTotals", () => {
  it("suma fijos y variables por categoría", () => {
    const month: MonthData = {
      banks: { ing: "0", santander: "0", trade: "0" },
      expenses: [{ id: "e1", name: "X", amount: "30", type: "variable", bank: "", paid: false, category: "disfrute", recurring: false }],
      fixed: [{ id: "f1", name: "Luz", amount: "50", type: "fijo", bank: "", paid: false, category: "gastos", recurring: true }],
    };
    const totals = categoryTotals(month);
    expect(totals.disfrute).toBe(30);
    expect(totals.gastos).toBe(50);
  });

  it("devuelve {} para mes undefined", () => {
    expect(categoryTotals(undefined)).toEqual({});
  });
});

describe("matchCategory", () => {
  const rules = [
    { id: "r1", match: "netflix", category: "gastos" as const },
    { id: "r2", match: "Luz", category: "inversion" as const },
  ];

  it("encuentra coincidencia sin distinguir mayúsculas", () => {
    expect(matchCategory("Netflix mensual", rules)).toBe("gastos");
  });

  it("devuelve undefined si no hay coincidencia", () => {
    expect(matchCategory("Café", rules)).toBeUndefined();
  });

  it("devuelve undefined para nombre vacío", () => {
    expect(matchCategory("   ", rules)).toBeUndefined();
  });
});

describe("parseCatRules", () => {
  it("filtra reglas inválidas y respeta categorías", () => {
    const raw = [
      { id: "r1", match: "netflix", category: "gastos" },
      { id: "r2", match: "x", category: "noexiste" },
      { match: "sinid", category: "ocio" },
    ];
    const out = parseCatRules(raw);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({ id: "r1", match: "netflix", category: "gastos" });
  });

  it("parseState round-trips catRules", () => {
    const state = parseState({
      catRules: [{ id: "r1", match: "netflix", category: "gastos" }],
    });
    expect(state.catRules).toHaveLength(1);
    expect(state.catRules[0].match).toBe("netflix");
  });
});

describe("parsePlanTargets", () => {
  it("usa valores por defecto si no hay datos", () => {
    expect(parsePlanTargets(undefined)).toEqual(PLAN_TARGETS_DEFAULT);
  });

  it("mantiene solo categorías válidas y respeta valores", () => {
    const out = parsePlanTargets({ inversion: "20", gastos: "60", crecimiento: "10", disfrute: "10", otro: "99" });
    expect(out).toEqual({ inversion: "20", gastos: "60", crecimiento: "10", disfrute: "10" });
  });

  it("parseState incluye planTargets por defecto", () => {
    const state = parseState({});
    expect(state.planTargets).toEqual(PLAN_TARGETS_DEFAULT);
  });
});

function makeGoal(overrides: Partial<Goal> = {}): Goal {
  return { id: "g1", name: "Fondo de emergencia", target: "6000", current: "2200", bank: "trade", rate: "", notes: "", ...overrides };
}

describe("emergencyFundAmount", () => {
  it("devuelve el importe ahorrado del objetivo 'Fondo de emergencia'", () => {
    expect(emergencyFundAmount([makeGoal()])).toBe(2200);
  });

  it("no distingue mayúsculas ni espacios en el nombre", () => {
    expect(emergencyFundAmount([makeGoal({ name: "  FONDO DE EMERGENCIA  " })])).toBe(2200);
  });

  it("devuelve 0 si no existe ese objetivo o no hay objetivos", () => {
    expect(emergencyFundAmount([])).toBe(0);
    expect(emergencyFundAmount([makeGoal({ name: "Vacaciones" })])).toBe(0);
  });
});

describe("computeDisponible", () => {
  const monthKey = currentMonthKey();

  it("Saldo total de bancos menos pendientes, sin objetivos", () => {
    const months: Record<string, MonthData> = {
      [monthKey]: {
        banks: { ing: "1000", santander: "500", trade: "300" },
        expenses: [
          { id: "e1", name: "Comida", amount: "200", type: "variable", bank: "ing", paid: false, category: "gastos", recurring: false },
          { id: "e2", name: "Ya pagado", amount: "999", type: "variable", bank: "ing", paid: true, category: "gastos", recurring: false },
        ],
        fixed: [],
      },
    };
    // (1000+500+300) − 200 pendiente (el pagado no cuenta) = 1600
    expect(computeDisponible(months, [], monthKey)).toBe(1600);
  });

  it("descuenta el Fondo de emergencia solo del saldo de Trade Republic", () => {
    const months: Record<string, MonthData> = {
      [monthKey]: {
        banks: { ing: "1000", santander: "0", trade: "500" },
        expenses: [],
        fixed: [],
      },
    };
    // Trade: 500 − 2200 = −1700; total bancos = 1000 + 0 − 1700 = −700; sin pendientes
    expect(computeDisponible(months, [makeGoal()], monthKey)).toBe(-700);
  });

  it("devuelve 0 si el mes no existe", () => {
    expect(computeDisponible({}, [], monthKey)).toBe(0);
  });
});
