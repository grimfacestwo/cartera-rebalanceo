import { CATEGORIES, expenseAppliesToMonth, type BankId, type CategoryId, type Expense, type MonthData } from "./state";

export type SummaryCellStatus = "paid" | "pending" | "na";

export type SummaryCell = {
  status: SummaryCellStatus;
  amount: number;
};

export type SummaryRow = {
  kind: "fixed" | "variable";
  key: string;
  name: string;
  amount: string;
  bank: BankId | "";
  category: CategoryId;
  months: string;
  daily: boolean;
  cells: Record<string, SummaryCell>;
};

export type SummaryCategoryGroup = {
  category: CategoryId;
  targetPct: string;
  rows: SummaryRow[];
};

// Si el gasto tiene mensualidad personalizada (p.ej. "1,4,7,10"), los meses
// que no coinciden se marcan "na" aunque el gasto exista ese mes (se siembra
// en todos los meses por defecto, ver parseState) — la mensualidad manda.
function cellFor(e: Expense | undefined, monthKey: string): SummaryCell {
  if (!e) return { status: "na", amount: 0 };
  if (!expenseAppliesToMonth(e, monthKey)) {
    return { status: "na", amount: 0 };
  }
  const amount = Number.parseFloat(e.amount) || 0;
  return { status: e.paid ? "paid" : "pending", amount };
}

/**
 * Construye la matriz gasto×mes para la vista resumen de Hogar.
 *
 * Filas fijas: identificadas por el `id` estable de la plantilla, unión de
 * lo que aparece en `months[key].fixed` a lo largo de `monthKeys`.
 * Filas variables: solo `recurring === true` (los puntuales no aportan a una
 * vista comparativa multi-mes); como cambian de `id` cada mes, se agrupan
 * por nombre normalizado.
 * Los campos mostrados (importe/banco/categoría/mensualidad) son los del
 * mes activo si el gasto existe ese mes; si no, los del avistamiento más
 * reciente entre los meses dados (para que una fila sin datos en el mes
 * activo siga mostrando algo razonable).
 */
export function buildExpenseMatrix(
  months: Record<string, MonthData>,
  monthKeys: string[],
  planTargets: Record<string, string>,
  rowOrder: string[] = [],
  activeMonth?: string,
): SummaryCategoryGroup[] {
  const fixedRows = new Map<string, SummaryRow>();
  const variableRows = new Map<string, SummaryRow>();

  for (const key of monthKeys) {
    const month = months[key];
    if (!month) continue;

    for (const e of month.fixed) {
      let row = fixedRows.get(e.id);
      if (!row) {
        row = { kind: "fixed", key: e.id, name: e.name, amount: e.amount, bank: e.bank, category: e.category, months: e.months ?? "", daily: e.daily === true, cells: {} };
        fixedRows.set(e.id, row);
      } else {
        row.name = e.name;
        row.amount = e.amount;
        row.bank = e.bank;
        row.category = e.category;
        row.months = e.months ?? "";
        row.daily = e.daily === true;
      }
      row.cells[key] = cellFor(e, key);
    }

    for (const e of month.expenses) {
      if (!e.recurring) continue;
      const normalized = e.name.trim().toLowerCase();
      if (!normalized) continue;
      let row = variableRows.get(normalized);
      if (!row) {
        row = { kind: "variable", key: normalized, name: e.name, amount: e.amount, bank: e.bank, category: e.category, months: e.months ?? "", daily: e.daily === true, cells: {} };
        variableRows.set(normalized, row);
      } else {
        row.name = e.name;
        row.amount = e.amount;
        row.bank = e.bank;
        row.category = e.category;
        row.months = e.months ?? "";
        row.daily = e.daily === true;
      }
      row.cells[key] = cellFor(e, key);
    }
  }

  const allRows = [...fixedRows.values(), ...variableRows.values()];
  for (const row of allRows) {
    for (const key of monthKeys) {
      if (!(key in row.cells)) row.cells[key] = cellFor(undefined, key);
    }
  }

  // Si el gasto existe en el mes activo, sus campos mostrados (banco/importe/
  // categoría/mensualidad) se toman de ESE mes en vez del avistamiento más
  // reciente — si no, un gasto cuyo banco cambió solo en meses futuros se
  // veía en el resumen con un banco distinto al que usan de verdad los
  // cálculos (Bancos, Plan de hogar) para el mes que se está viendo.
  const activeData = activeMonth ? months[activeMonth] : undefined;
  if (activeData) {
    for (const row of allRows) {
      const match =
        row.kind === "fixed"
          ? activeData.fixed.find((e) => e.id === row.key)
          : activeData.expenses.find((e) => e.recurring && e.name.trim().toLowerCase() === row.key);
      if (match) {
        row.name = match.name;
        row.amount = match.amount;
        row.bank = match.bank;
        row.category = match.category;
        row.months = match.months ?? "";
        row.daily = match.daily === true;
      }
    }
  }

  // Orden preferido por el usuario (arrastrado en el resumen); las filas sin
  // posición guardada mantienen su orden natural al final (sort estable).
  const orderIndex = new Map(rowOrder.map((key, i) => [key, i]));
  allRows.sort((a, b) => {
    const ia = orderIndex.get(a.key) ?? Number.MAX_SAFE_INTEGER;
    const ib = orderIndex.get(b.key) ?? Number.MAX_SAFE_INTEGER;
    return ia - ib;
  });

  return CATEGORIES.map((category) => ({
    category,
    targetPct: planTargets[category] ?? "",
    rows: allRows.filter((r) => r.category === category),
  }));
}
