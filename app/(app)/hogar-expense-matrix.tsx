"use client";

import { Fragment, useState } from "react";
import type { SummaryCategoryGroup, SummaryRow } from "@/lib/matrix";
import { CATEGORIES, CATEGORY_LABELS, CATEGORY_COLORS, monthLabel, monthShortLabel, type BankId, type CategoryId } from "@/lib/state";
import { BankPicker } from "./hogar-bank-picker";
import { MonthChips } from "./hogar-month-chips";
import styles from "./hogar.module.css";

const currency = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

// Anchos de columna del resumen (deben coincidir con los `width` de
// hogar.module.css: .summaryActionsHeader/Cell, .summaryConceptHeader/Cell,
// .summaryMonthsHeader/Cell, .summaryAmountHeader/Cell, .summaryBankHeader/Cell
// y .summaryMonthHeader/.summaryCell). Con table-layout:fixed el ancho total
// de la tabla debe fijarse explícitamente (en rem) o el navegador reparte el
// 100% del contenedor entre columnas en vez de respetar estos valores.
const FIXED_COLS_REM = 4.5 + 9 + 19.5 + 6.5 + 4.5; // acciones + concepto + mensualidad + importe + banco
const MONTH_COL_REM = 4.5;

export function ExpenseMatrix({
  groups,
  monthKeys,
  activeMonth,
  activeDaysRemaining,
  collapsedCategories,
  onSelectMonth,
  onSetRowBank,
  onSetRowName,
  onSetRowAmount,
  onSetRowMonths,
  onToggleCell,
  onToggleCategory,
  onSetPlanTarget,
  onMoveRow,
  onDeleteRow,
  onAddRow,
}: {
  groups: SummaryCategoryGroup[];
  monthKeys: string[];
  activeMonth: string;
  activeDaysRemaining: number;
  collapsedCategories: Set<CategoryId>;
  onSelectMonth: (key: string) => void;
  onSetRowBank: (row: SummaryRow, bank: BankId | "") => void;
  onSetRowName: (row: SummaryRow, name: string) => void;
  onSetRowAmount: (row: SummaryRow, amount: string) => void;
  onSetRowMonths: (row: SummaryRow, months: string) => void;
  onToggleCell: (row: SummaryRow, monthKey: string) => void;
  onToggleCategory: (cat: CategoryId) => void;
  onSetPlanTarget: (cat: CategoryId, value: string) => void;
  onMoveRow: (row: SummaryRow, direction: "up" | "down") => void;
  onDeleteRow: (row: SummaryRow) => void;
  onAddRow: (input: { name: string; amount: string; bank: BankId | ""; category: CategoryId; months: string }) => void;
}) {
  const [newName, setNewName] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newBank, setNewBank] = useState<BankId | "">("");
  const [newCategory, setNewCategory] = useState<CategoryId>("gastos");
  const [newMonths, setNewMonths] = useState("");

  const visibleGroups = groups.filter((g) => g.rows.length > 0);
  if (monthKeys.length === 0) return null;
  const colCount = 5 + monthKeys.length;

  const submitAdd = () => {
    const name = newName.trim();
    if (!name) return;
    onAddRow({ name, amount: newAmount, bank: newBank, category: newCategory, months: newMonths });
    setNewName("");
    setNewAmount("");
    setNewBank("");
    setNewMonths("");
  };

  return (
    <>
    <div className={styles.summaryWrap}>
      <table
        className={styles.summaryTable}
        style={{ width: `${FIXED_COLS_REM + MONTH_COL_REM * monthKeys.length}rem` }}
      >
        <thead>
          <tr>
            <th className={styles.summaryActionsHeader} />
            <th className={styles.summaryConceptHeader}>Concepto</th>
            <th className={styles.summaryMonthsHeader}>Mensualidad</th>
            <th className={styles.summaryAmountHeader}>Importe</th>
            <th className={styles.summaryBankHeader}>Banco</th>
            {monthKeys.map((key) => (
              <th
                key={key}
                role="button"
                tabIndex={0}
                title={monthLabel(key)}
                className={`${styles.summaryMonthHeader} ${key === activeMonth ? styles.summaryMonthHeaderActive : ""}`}
                onClick={() => onSelectMonth(key)}
                onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); onSelectMonth(key); } }}
              >
                {monthShortLabel(key)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleGroups.map((group) => {
            const collapsed = collapsedCategories.has(group.category);
            return (
            <Fragment key={group.category}>
              <tr
                className={styles.summaryCatRow}
                role="button"
                tabIndex={0}
                aria-expanded={!collapsed}
                onClick={() => onToggleCategory(group.category)}
                onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); onToggleCategory(group.category); } }}
              >
                <td colSpan={colCount} style={{ background: `${CATEGORY_COLORS[group.category]}1a` }}>
                  <span className={styles.chevron}>{collapsed ? "▶" : "▼"}</span>
                  {CATEGORY_LABELS[group.category].toUpperCase()}
                  <span className={styles.summaryTargetWrap} onClick={(ev) => ev.stopPropagation()}>
                    {" · "}
                    <input
                      type="text"
                      inputMode="decimal"
                      value={group.targetPct}
                      onChange={(ev) => { const v = ev.target.value; if (v === "" || /^\d*\.?\d*$/.test(v)) onSetPlanTarget(group.category, v); }}
                      className={styles.summaryTargetInput}
                      aria-label={`Objetivo de ${CATEGORY_LABELS[group.category]} en porcentaje`}
                    />
                    %
                  </span>
                </td>
              </tr>
              {!collapsed && group.rows.map((row, idx) => (
                <tr key={`${group.category}-${row.kind}-${row.key}`}>
                  <td className={styles.summaryActionsCell}>
                    <button type="button" className={styles.moveBtn} onClick={() => onMoveRow(row, "up")} disabled={idx === 0} aria-label={`Subir ${row.name}`} title="Subir">▲</button>
                    <button type="button" className={styles.moveBtn} onClick={() => onMoveRow(row, "down")} disabled={idx === group.rows.length - 1} aria-label={`Bajar ${row.name}`} title="Bajar">▼</button>
                    <button type="button" className={styles.removeBtn} onClick={() => onDeleteRow(row)} aria-label={`Eliminar ${row.name}`} title="Eliminar">×</button>
                  </td>
                  <td className={styles.summaryConceptCell}>
                    <input
                      type="text"
                      value={row.name}
                      onChange={(ev) => onSetRowName(row, ev.target.value)}
                      className={styles.expenseInput}
                      aria-label={`Concepto de ${row.name}`}
                      style={{ width: "8rem" }}
                    />
                  </td>
                  <td className={styles.summaryMonthsCell}>
                    <MonthChips
                      value={row.months}
                      onChange={(spec) => onSetRowMonths(row, spec)}
                      ariaLabel={`Mensualidad de ${row.name}`}
                    />
                  </td>
                  <td className={styles.summaryAmountCell}>
                    <div className={styles.amountCell}>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={row.amount}
                        onChange={(ev) => { const v = ev.target.value; if (v === "" || /^\d*\.?\d*$/.test(v)) onSetRowAmount(row, v); }}
                        className={styles.expenseInput}
                        aria-label={`Importe de ${row.name}`}
                        style={{ width: "4rem" }}
                      />
                      <span className={styles.amountUnit}>€</span>
                    </div>
                    {row.daily && (
                      <div
                        className={styles.dailyEffective}
                        title={`Tarifa diaria × ${activeDaysRemaining} días restantes de ${monthShortLabel(activeMonth)}`}
                      >
                        {currency.format((Number.parseFloat(row.amount) || 0) * activeDaysRemaining)}
                      </div>
                    )}
                  </td>
                  <td className={styles.summaryBankCell}>
                    <BankPicker value={row.bank} onChange={(b) => onSetRowBank(row, b)} ariaLabel={`Banco de ${row.name}`} />
                  </td>
                  {monthKeys.map((key) => {
                    const cell = row.cells[key];
                    const cls =
                      cell.status === "paid" ? styles.summaryCellPaid : cell.status === "pending" ? styles.summaryCellPending : styles.summaryCellNa;
                    const na = cell.status === "na";
                    return (
                      <td
                        key={key}
                        className={`${styles.summaryCell} ${cls}`}
                        role={na ? undefined : "button"}
                        tabIndex={na ? undefined : 0}
                        onClick={na ? undefined : () => onToggleCell(row, key)}
                        onKeyDown={na ? undefined : (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); onToggleCell(row, key); } }}
                        title={na ? "No aplica este mes" : `${cell.status === "paid" ? "Pagado" : "Pendiente"} · ${currency.format(cell.amount)}`}
                      >
                        {cell.status === "paid" ? "✓" : cell.status === "pending" ? "•" : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
    <div className={styles.addExpenseBar}>
      <input
        type="text"
        value={newName}
        onChange={(ev) => setNewName(ev.target.value)}
        placeholder="Nuevo gasto"
        className={styles.expenseInput}
        aria-label="Nombre del nuevo gasto"
        style={{ width: "9rem" }}
        onKeyDown={(ev) => { if (ev.key === "Enter") submitAdd(); }}
      />
      <MonthChips value={newMonths} onChange={setNewMonths} ariaLabel="Mensualidad del nuevo gasto" />
      <div className={styles.amountCell}>
        <input
          type="text"
          inputMode="decimal"
          value={newAmount}
          onChange={(ev) => { const v = ev.target.value; if (v === "" || /^\d*\.?\d*$/.test(v)) setNewAmount(v); }}
          placeholder="0"
          className={styles.expenseInput}
          aria-label="Importe del nuevo gasto"
          style={{ width: "4rem" }}
        />
        <span className={styles.amountUnit}>€</span>
      </div>
      <BankPicker value={newBank} onChange={setNewBank} ariaLabel="Banco del nuevo gasto" />
      <select
        value={newCategory}
        onChange={(ev) => setNewCategory(ev.target.value as CategoryId)}
        className={styles.expenseSelect}
        aria-label="Categoría del nuevo gasto"
      >
        {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
      </select>
      <button type="button" className={styles.addBtn} onClick={submitAdd}>+ Añadir</button>
    </div>
    </>
  );
}
