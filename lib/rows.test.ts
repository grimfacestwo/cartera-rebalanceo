import { describe, expect, it } from "vitest";
import {
  addFixedRowToTemplate,
  addPuntualExpense,
  computeMovedRowOrder,
  deletePuntualExpense,
  deleteRowFromMonths,
  deleteRowFromTemplate,
  patchPuntualExpense,
  patchRowInMonths,
  patchRowTemplate,
  seedFixedRowIntoMonths,
  toggleCellPaid,
  togglePuntualPaid,
} from "./rows";
import type { SummaryCategoryGroup, SummaryRow } from "./matrix";
import { DEFAULT_BANKS, type Expense, type FixedExpense, type MonthData } from "./state";

function expense(overrides: Partial<Expense>): Expense {
  return {
    id: "e1",
    name: "Gasto",
    amount: "10",
    type: "fijo",
    bank: "ing",
    paid: false,
    category: "gastos",
    recurring: false,
    ...overrides,
  };
}

function month(overrides: Partial<MonthData>): MonthData {
  return { banks: { ...DEFAULT_BANKS }, expenses: [], fixed: [], ...overrides };
}

function fixedRow(overrides: Partial<SummaryRow>): SummaryRow {
  return {
    kind: "fixed",
    key: "hipoteca",
    name: "Hipoteca",
    amount: "672.80",
    bank: "ing",
    category: "gastos",
    months: "",
    daily: false,
    cells: {},
    ...overrides,
  };
}

function variableRow(overrides: Partial<SummaryRow>): SummaryRow {
  return { ...fixedRow(overrides), kind: "variable", key: "gimnasio", name: "Gimnasio" };
}

describe("patchRowInMonths", () => {
  it("aplica el patch al gasto fijo (por id) en todos los meses donde aparece", () => {
    const months: Record<string, MonthData> = {
      "2026-01": month({ fixed: [expense({ id: "hipoteca", amount: "672.80" })] }),
      "2026-02": month({ fixed: [expense({ id: "hipoteca", amount: "672.80" })] }),
      "2026-03": month({ fixed: [] }), // no aparece este mes, no se toca
    };
    const row = fixedRow({});
    const next = patchRowInMonths(months, row, (e) => ({ ...e, amount: "700" }));
    expect(next["2026-01"].fixed[0].amount).toBe("700");
    expect(next["2026-02"].fixed[0].amount).toBe("700");
    expect(next["2026-03"]).toBe(months["2026-03"]); // referencia sin cambios
  });

  it("aplica el patch a un gasto variable recurrente por nombre normalizado", () => {
    const months: Record<string, MonthData> = {
      "2026-01": month({ expenses: [expense({ id: "a1", name: "Gimnasio", recurring: true })] }),
      "2026-02": month({ expenses: [expense({ id: "a2", name: "GIMNASIO ", recurring: true })] }),
    };
    const row = variableRow({});
    const next = patchRowInMonths(months, row, (e) => ({ ...e, paid: true }));
    expect(next["2026-01"].expenses[0].paid).toBe(true);
    expect(next["2026-02"].expenses[0].paid).toBe(true);
  });
});

describe("patchRowTemplate", () => {
  const tmpl: FixedExpense[] = [{ id: "hipoteca", name: "Hipoteca", amount: "672.80", bank: "ing", category: "gastos" }];

  it("actualiza la plantilla si la fila es fija", () => {
    const next = patchRowTemplate(tmpl, fixedRow({}), (f) => ({ ...f, amount: "700" }));
    expect(next[0].amount).toBe("700");
  });

  it("no toca la plantilla si la fila es variable", () => {
    const next = patchRowTemplate(tmpl, variableRow({}), (f) => ({ ...f, amount: "700" }));
    expect(next).toBe(tmpl);
  });
});

describe("toggleCellPaid", () => {
  it("alterna paid solo en el mes indicado, no en los demás", () => {
    const months: Record<string, MonthData> = {
      "2026-01": month({ fixed: [expense({ id: "hipoteca", paid: false })] }),
      "2026-02": month({ fixed: [expense({ id: "hipoteca", paid: false })] }),
    };
    const next = toggleCellPaid(months, fixedRow({}), "2026-01");
    expect(next["2026-01"].fixed[0].paid).toBe(true);
    expect(next["2026-02"].fixed[0].paid).toBe(false);
  });

  it("no hace nada si el mes no existe o el gasto no aparece ese mes", () => {
    const months: Record<string, MonthData> = { "2026-01": month({ fixed: [] }) };
    expect(toggleCellPaid(months, fixedRow({}), "2026-01")).toBe(months);
    expect(toggleCellPaid(months, fixedRow({}), "2099-01")).toBe(months);
  });
});

describe("addFixedRowToTemplate / seedFixedRowIntoMonths", () => {
  it("añade el gasto a la plantilla y lo siembra en todos los meses existentes", () => {
    const tmpl: FixedExpense[] = [];
    const months: Record<string, MonthData> = {
      "2026-01": month({}),
      "2026-02": month({}),
    };
    const input = { id: "seguro", name: "Seguro", amount: "40", bank: "ing" as const, category: "gastos" as const, months: "" };
    const nextTmpl = addFixedRowToTemplate(tmpl, input);
    const nextMonths = seedFixedRowIntoMonths(months, input);
    expect(nextTmpl).toHaveLength(1);
    expect(nextTmpl[0].id).toBe("seguro");
    expect(nextMonths["2026-01"].fixed[0].name).toBe("Seguro");
    expect(nextMonths["2026-02"].fixed[0].name).toBe("Seguro");
  });

  it("no duplica el gasto en un mes que ya lo tuviera sembrado", () => {
    const months: Record<string, MonthData> = { "2026-01": month({ fixed: [expense({ id: "seguro", name: "Seguro" })] }) };
    const input = { id: "seguro", name: "Seguro", amount: "40", bank: "" as const, category: "gastos" as const, months: "" };
    const next = seedFixedRowIntoMonths(months, input);
    expect(next["2026-01"].fixed).toHaveLength(1);
  });

  it("solo añade el campo months si se especifica", () => {
    const withMonths = addFixedRowToTemplate([], { id: "s", name: "S", amount: "1", bank: "", category: "gastos", months: "1,7" });
    expect(withMonths[0].months).toBe("1,7");
    const withoutMonths = addFixedRowToTemplate([], { id: "s", name: "S", amount: "1", bank: "", category: "gastos", months: "" });
    expect(withoutMonths[0].months).toBeUndefined();
  });
});

describe("deleteRowFromTemplate / deleteRowFromMonths", () => {
  it("quita el gasto fijo de la plantilla y de todos los meses", () => {
    const tmpl: FixedExpense[] = [{ id: "hipoteca", name: "Hipoteca", amount: "672.80", bank: "ing", category: "gastos" }];
    const months: Record<string, MonthData> = {
      "2026-01": month({ fixed: [expense({ id: "hipoteca" })] }),
      "2026-02": month({ fixed: [expense({ id: "hipoteca" })] }),
    };
    const row = fixedRow({});
    expect(deleteRowFromTemplate(tmpl, row)).toHaveLength(0);
    const nextMonths = deleteRowFromMonths(months, row);
    expect(nextMonths["2026-01"].fixed).toHaveLength(0);
    expect(nextMonths["2026-02"].fixed).toHaveLength(0);
  });

  it("no toca la plantilla si la fila es variable, solo los meses", () => {
    const tmpl: FixedExpense[] = [{ id: "hipoteca", name: "Hipoteca", amount: "672.80", bank: "ing", category: "gastos" }];
    const months: Record<string, MonthData> = {
      "2026-01": month({ expenses: [expense({ id: "a1", name: "Gimnasio", recurring: true })] }),
    };
    const row = variableRow({});
    expect(deleteRowFromTemplate(tmpl, row)).toBe(tmpl);
    expect(deleteRowFromMonths(months, row)["2026-01"].expenses).toHaveLength(0);
  });
});

describe("addPuntualExpense / togglePuntualPaid / patchPuntualExpense / deletePuntualExpense", () => {
  it("añade un gasto puntual solo al mes indicado, sin recurring", () => {
    const months: Record<string, MonthData> = { "2026-09": month({}) };
    const next = addPuntualExpense(months, "2026-09", { id: "p1", name: "Movil", amount: "255.85", bank: "ing", category: "gastos" });
    expect(next["2026-09"].expenses).toEqual([
      { id: "p1", name: "Movil", amount: "255.85", type: "variable", bank: "ing", paid: false, category: "gastos", recurring: false },
    ]);
  });

  it("no hace nada si el mes no existe", () => {
    const months: Record<string, MonthData> = {};
    expect(addPuntualExpense(months, "2026-09", { id: "p1", name: "Movil", amount: "1", bank: "ing", category: "gastos" })).toBe(months);
  });

  it("alterna pagado solo del gasto puntual indicado, no de otros del mismo mes", () => {
    const months: Record<string, MonthData> = {
      "2026-09": month({ expenses: [expense({ id: "p1", name: "IBI", recurring: false }), expense({ id: "p2", name: "Basura", recurring: false })] }),
    };
    const next = togglePuntualPaid(months, "2026-09", "p1");
    expect(next["2026-09"].expenses.find((e) => e.id === "p1")?.paid).toBe(true);
    expect(next["2026-09"].expenses.find((e) => e.id === "p2")?.paid).toBe(false);
  });

  it("aplica el patch solo al gasto puntual indicado", () => {
    const months: Record<string, MonthData> = {
      "2026-09": month({ expenses: [expense({ id: "p1", name: "Movil", amount: "255.85", recurring: false })] }),
    };
    const next = patchPuntualExpense(months, "2026-09", "p1", { amount: "200" });
    expect(next["2026-09"].expenses[0].amount).toBe("200");
  });

  it("elimina solo el gasto puntual indicado de su mes", () => {
    const months: Record<string, MonthData> = {
      "2026-09": month({ expenses: [expense({ id: "p1", name: "IBI", recurring: false }), expense({ id: "p2", name: "Basura", recurring: false })] }),
    };
    const next = deletePuntualExpense(months, "2026-09", "p1");
    expect(next["2026-09"].expenses).toHaveLength(1);
    expect(next["2026-09"].expenses[0].id).toBe("p2");
  });
});

describe("computeMovedRowOrder", () => {
  function group(category: SummaryCategoryGroup["category"], rows: SummaryRow[]): SummaryCategoryGroup {
    return { category, targetPct: "", rows };
  }

  it("intercambia con el vecino visible siguiente al mover hacia abajo", () => {
    const rows = [fixedRow({ key: "a" }), fixedRow({ key: "b" }), fixedRow({ key: "c" })];
    const groups = [group("gastos", rows)];
    const order = computeMovedRowOrder(groups, groups, rows[0], "down");
    expect(order).toEqual(["b", "a", "c"]);
  });

  it("devuelve null si ya está en el extremo (no hay vecino hacia arriba)", () => {
    const rows = [fixedRow({ key: "a" }), fixedRow({ key: "b" })];
    const groups = [group("gastos", rows)];
    expect(computeMovedRowOrder(groups, groups, rows[0], "up")).toBeNull();
  });

  it("usa el vecino visible (filtrado) pero aplica el intercambio sobre el orden completo", () => {
    // "b" está oculta por el filtro; al bajar "a" debe intercambiar con "c"
    // (su vecino visible), pero el resultado debe conservar "b" en su sitio.
    const all = [fixedRow({ key: "a" }), fixedRow({ key: "b" }), fixedRow({ key: "c" })];
    const visible = [fixedRow({ key: "a" }), fixedRow({ key: "c" })];
    const allGroups = [group("gastos", all)];
    const filteredGroups = [group("gastos", visible)];
    const order = computeMovedRowOrder(allGroups, filteredGroups, all[0], "down");
    expect(order).toEqual(["c", "b", "a"]);
  });
});
