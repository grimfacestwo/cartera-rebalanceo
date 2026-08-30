import type { SummaryCategoryGroup, SummaryRow } from "./matrix";
import type { BankId, CategoryId, Expense, FixedExpense, MonthData } from "./state";

function matchesRow(e: Expense, row: SummaryRow): boolean {
  if (row.kind === "fixed") return e.id === row.key;
  return e.recurring && e.name.trim().toLowerCase() === row.key;
}

/**
 * Aplica `patch` al gasto de una fila del resumen en TODOS los meses donde
 * aparece (por id si es fijo, por nombre si es variable recurrente).
 */
export function patchRowInMonths(
  months: Record<string, MonthData>,
  row: SummaryRow,
  patch: (e: Expense) => Expense,
): Record<string, MonthData> {
  const next: Record<string, MonthData> = {};
  for (const [key, m] of Object.entries(months)) {
    if (row.kind === "fixed") {
      next[key] = m.fixed.some((e) => matchesRow(e, row))
        ? { ...m, fixed: m.fixed.map((e) => (matchesRow(e, row) ? patch(e) : e)) }
        : m;
    } else {
      next[key] = m.expenses.some((e) => matchesRow(e, row))
        ? { ...m, expenses: m.expenses.map((e) => (matchesRow(e, row) ? patch(e) : e)) }
        : m;
    }
  }
  return next;
}

/** Aplica `patch` a la plantilla de gastos fijos si la fila es de tipo "fixed"; si no, no hace nada. */
export function patchRowTemplate(
  fixedExpenses: FixedExpense[],
  row: SummaryRow,
  patch: (f: FixedExpense) => FixedExpense,
): FixedExpense[] {
  if (row.kind !== "fixed") return fixedExpenses;
  return fixedExpenses.map((f) => (f.id === row.key ? patch(f) : f));
}

/** Alterna pagado/pendiente de un gasto en un mes concreto (no afecta a los demás meses de la fila). */
export function toggleCellPaid(
  months: Record<string, MonthData>,
  row: SummaryRow,
  monthKey: string,
): Record<string, MonthData> {
  const m = months[monthKey];
  if (!m) return months;
  if (row.kind === "fixed") {
    if (!m.fixed.some((e) => matchesRow(e, row))) return months;
    return { ...months, [monthKey]: { ...m, fixed: m.fixed.map((e) => (matchesRow(e, row) ? { ...e, paid: !e.paid } : e)) } };
  }
  if (!m.expenses.some((e) => matchesRow(e, row))) return months;
  return { ...months, [monthKey]: { ...m, expenses: m.expenses.map((e) => (matchesRow(e, row) ? { ...e, paid: !e.paid } : e)) } };
}

export type NewRowInput = {
  id: string;
  name: string;
  amount: string;
  bank: BankId | "";
  category: CategoryId;
  months: string;
};

/**
 * Añade un gasto fijo nuevo a la plantilla. `id` se genera fuera (no
 * determinista) para que esta función se mantenga pura. Independiente de
 * `seedFixedRowIntoMonths` porque ambas se aplican con su propio `setState`
 * funcional (fixedExpenses y months son estados de React separados).
 */
export function addFixedRowToTemplate(fixedExpenses: FixedExpense[], input: NewRowInput): FixedExpense[] {
  const { id, name, amount, bank, category, months: monthsSpec } = input;
  const monthsField = monthsSpec.trim() !== "" ? { months: monthsSpec } : {};
  return [...fixedExpenses, { id, name, amount, bank, category, daily: false, ...monthsField }];
}

/**
 * Siembra el gasto fijo nuevo en todos los meses ya creados que no lo tengan
 * aún (igual que hace parseState al cargar), para que la nueva fila aparezca
 * ya en el resumen sin recargar. Ver `addFixedRowToTemplate`.
 */
export function seedFixedRowIntoMonths(months: Record<string, MonthData>, input: NewRowInput): Record<string, MonthData> {
  const { id, name, amount, bank, category, months: monthsSpec } = input;
  const monthsField = monthsSpec.trim() !== "" ? { months: monthsSpec } : {};
  const next: Record<string, MonthData> = {};
  for (const [key, m] of Object.entries(months)) {
    if (m.fixed.some((e) => e.id === id)) { next[key] = m; continue; }
    next[key] = { ...m, fixed: [...m.fixed, { id, name, amount, type: "fijo", bank, paid: false, category, recurring: true, daily: false, ...monthsField }] };
  }
  return next;
}

/** Quita el gasto de una fila fija de la plantilla (no-op si la fila es variable). */
export function deleteRowFromTemplate(fixedExpenses: FixedExpense[], row: SummaryRow): FixedExpense[] {
  if (row.kind !== "fixed") return fixedExpenses;
  return fixedExpenses.filter((f) => f.id !== row.key);
}

/** Elimina el gasto de una fila del resumen de TODOS los meses donde aparece. Ver `deleteRowFromTemplate`. */
export function deleteRowFromMonths(months: Record<string, MonthData>, row: SummaryRow): Record<string, MonthData> {
  const next: Record<string, MonthData> = {};
  for (const [key, m] of Object.entries(months)) {
    if (row.kind === "fixed") {
      next[key] = m.fixed.some((e) => matchesRow(e, row))
        ? { ...m, fixed: m.fixed.filter((e) => !matchesRow(e, row)) }
        : m;
    } else {
      next[key] = m.expenses.some((e) => matchesRow(e, row))
        ? { ...m, expenses: m.expenses.filter((e) => !matchesRow(e, row)) }
        : m;
    }
  }
  return next;
}

/**
 * Calcula el nuevo `rowOrder` al mover una fila un puesto arriba/abajo dentro
 * de su categoría. Se mueve respecto al vecino VISIBLE (según los filtros
 * activos, `filteredGroups`), pero el intercambio se aplica sobre el orden
 * maestro completo (`allGroups`, sin filtrar) para no perder la posición de
 * las filas que los filtros dejan ocultas. Devuelve `null` si no hay
 * movimiento posible (ya está en el extremo, o no se encuentra la fila).
 */
export function computeMovedRowOrder(
  allGroups: SummaryCategoryGroup[],
  filteredGroups: SummaryCategoryGroup[],
  row: SummaryRow,
  direction: "up" | "down",
): string[] | null {
  const group = filteredGroups.find((g) => g.category === row.category);
  if (!group) return null;
  const idx = group.rows.findIndex((r) => r.key === row.key);
  const targetIdx = direction === "up" ? idx - 1 : idx + 1;
  if (idx === -1 || targetIdx < 0 || targetIdx >= group.rows.length) return null;
  const neighborKey = group.rows[targetIdx].key;
  const fullOrder = allGroups.flatMap((g) => g.rows.map((r) => r.key));
  const ia = fullOrder.indexOf(row.key);
  const ib = fullOrder.indexOf(neighborKey);
  if (ia === -1 || ib === -1) return null;
  const newOrder = [...fullOrder];
  [newOrder[ia], newOrder[ib]] = [newOrder[ib], newOrder[ia]];
  return newOrder;
}
