import { describe, expect, it } from "vitest";
import { buildExpenseMatrix } from "./matrix";
import { DEFAULT_BANKS, type Expense, type MonthData } from "./state";

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

describe("buildExpenseMatrix", () => {
  it("sigue un gasto fijo por id a través de varios meses con distinto estado de pago", () => {
    const months: Record<string, MonthData> = {
      "2026-01": month({ fixed: [expense({ id: "hipoteca", name: "Hipoteca", paid: true })] }),
      "2026-02": month({ fixed: [expense({ id: "hipoteca", name: "Hipoteca", paid: false })] }),
      "2026-03": month({ fixed: [expense({ id: "hipoteca", name: "Hipoteca", paid: true })] }),
    };
    const keys = ["2026-01", "2026-02", "2026-03"];
    const groups = buildExpenseMatrix(months, keys, {});
    const row = groups.flatMap((g) => g.rows).find((r) => r.key === "hipoteca");
    expect(row).toBeDefined();
    expect(row!.cells["2026-01"].status).toBe("paid");
    expect(row!.cells["2026-02"].status).toBe("pending");
    expect(row!.cells["2026-03"].status).toBe("paid");
  });

  it("marca como 'na' un mes en el que el gasto fijo no existe", () => {
    const months: Record<string, MonthData> = {
      "2026-01": month({ fixed: [expense({ id: "hipoteca" })] }),
      "2026-02": month({ fixed: [] }),
    };
    const keys = ["2026-01", "2026-02"];
    const groups = buildExpenseMatrix(months, keys, {});
    const row = groups.flatMap((g) => g.rows).find((r) => r.key === "hipoteca");
    expect(row!.cells["2026-02"].status).toBe("na");
  });

  it("agrupa gastos variables recurrentes por nombre aunque cambien de id cada mes", () => {
    const months: Record<string, MonthData> = {
      "2026-01": month({ expenses: [expense({ id: "a1", name: "Gimnasio", recurring: true, paid: true })] }),
      "2026-02": month({ expenses: [expense({ id: "a2", name: "Gimnasio", recurring: true, paid: false })] }),
    };
    const keys = ["2026-01", "2026-02"];
    const groups = buildExpenseMatrix(months, keys, {});
    const rows = groups.flatMap((g) => g.rows).filter((r) => r.name === "Gimnasio");
    expect(rows).toHaveLength(1);
    expect(rows[0].cells["2026-01"].status).toBe("paid");
    expect(rows[0].cells["2026-02"].status).toBe("pending");
  });

  it("excluye los gastos variables puntuales (no recurrentes) de la matriz", () => {
    const months: Record<string, MonthData> = {
      "2026-01": month({ expenses: [expense({ id: "a1", name: "Regalo", recurring: false })] }),
    };
    const keys = ["2026-01"];
    const groups = buildExpenseMatrix(months, keys, {});
    const rows = groups.flatMap((g) => g.rows);
    expect(rows.find((r) => r.name === "Regalo")).toBeUndefined();
  });

  it("agrupa las filas por categoría usando el avistamiento más reciente y aplica el % objetivo", () => {
    const months: Record<string, MonthData> = {
      "2026-01": month({ fixed: [expense({ id: "ahorro", name: "Ahorro", category: "inversion" })] }),
      "2026-02": month({ fixed: [expense({ id: "ahorro", name: "Ahorro", category: "crecimiento" })] }),
    };
    const keys = ["2026-01", "2026-02"];
    const groups = buildExpenseMatrix(months, keys, { inversion: "15", crecimiento: "5" });
    const crecimiento = groups.find((g) => g.category === "crecimiento")!;
    const inversion = groups.find((g) => g.category === "inversion")!;
    expect(crecimiento.targetPct).toBe("5");
    expect(crecimiento.rows.map((r) => r.key)).toContain("ahorro");
    expect(inversion.rows.map((r) => r.key)).not.toContain("ahorro");
  });
});
