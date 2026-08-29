"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { AssetDef } from "@/lib/rebalance";
import { buildExpenseMatrix, type SummaryCategoryGroup, type SummaryRow } from "@/lib/matrix";
import {
  BANK_IDS,
  BANK_LABELS,
  BANK_COLORS,
  CATEGORY_LABELS,
  CATEGORY_COLORS,
  CATEGORIES,
  DEFAULT_ASSETS,
  DEFAULT_VALUES,
  DEFAULT_BANKS,
  addMonth,
  bankRemaining,
  categoryTotals,
  currentMonthKey,
  daysInMonth,
  daysRemaining,
  effectiveAmount,
  DEFAULT_FIXED_EXPENSES,
  monthLabel,
  parseState,
  PLAN_TARGETS_DEFAULT,
  sortMonthKeys,
  type BankId,
  type CategoryId,
  type CategoryRule,
  type Expense,
  type FixedExpense,
  type Goal,
  type MonthData,
  type PortfolioValues,
} from "@/lib/state";
import styles from "./hogar.module.css";

const currency = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const pct = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 });

type SaveStatus = "idle" | "saving" | "saved" | "error";

const EMPTY_MONTH: MonthData = { banks: { ...DEFAULT_BANKS }, expenses: [], fixed: [] };

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `n${Date.now()}`;
}

function monthShortLabel(key: string): string {
  const year = key.slice(2, 4);
  return `${monthLabel(key).slice(0, 3)} ${year}`;
}

const PLAN_TOLERANCE = 5;

function planCompliant(cat: string, actualPct: number, target: number): boolean {
  if (cat === "inversion" || cat === "crecimiento") return actualPct >= target - PLAN_TOLERANCE;
  return actualPct <= target + PLAN_TOLERANCE;
}

function PlanDonut({
  totals,
  planTargets,
  breakdown,
  currency,
}: {
  totals: Record<string, number>;
  planTargets: Record<string, string>;
  breakdown: Record<CategoryId, { name: string; amount: number; paid: boolean }[]>;
  currency: Intl.NumberFormat;
}) {
  const [openCat, setOpenCat] = useState<CategoryId | null>(null);
  const amounts = CATEGORIES.map((cat) => ({ cat, amount: totals[cat] || 0 }));
  const total = amounts.reduce((s, a) => s + a.amount, 0);
  const size = 180;
  const stroke = 22;
  const r = (size - stroke) / 2;
  const center = size / 2;
  const C = 2 * Math.PI * r;
  let offset = 0;

  const buildTooltip = (cat: CategoryId) => {
    const items = breakdown[cat] || [];
    const head = `${CATEGORY_LABELS[cat]}: ${currency.format(totals[cat] || 0)}`;
    if (!items.length) return `${head}\nSin gastos`;
    const lines = items.map((it) => `· ${it.name}: ${currency.format(it.amount)}${it.paid ? " (pagado)" : ""}`);
    return `${head}\n${lines.join("\n")}`;
  };

  return (
    <div className={styles.planWrap}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Reparto del plan de hogar">
        <circle cx={center} cy={center} r={r} fill="none" stroke="#f1f5f9" strokeWidth={stroke} />
        {total > 0 &&
          amounts.map(({ cat, amount }) => {
            const frac = amount / total;
            const seg = frac * C;
            const el = (
              <circle
                key={cat}
                cx={center}
                cy={center}
                r={r}
                fill="none"
                stroke={CATEGORY_COLORS[cat as CategoryId]}
                strokeWidth={stroke}
                strokeDasharray={`${seg} ${C - seg}`}
                strokeDashoffset={-offset}
                transform={`rotate(-90 ${center} ${center})`}
              >
                <title>{buildTooltip(cat)}</title>
              </circle>
            );
            offset += seg;
            return el;
          })}
        {total > 0 && (
          <text x={center} y={center - 4} textAnchor="middle" className={styles.donutTotal}>
            {currency.format(total)}
          </text>
        )}
        {total > 0 && (
          <text x={center} y={center + 16} textAnchor="middle" className={styles.donutSub}>
            Total mes
          </text>
        )}
      </svg>
      <ul className={styles.planLegend}>
        {CATEGORIES.map((cat) => {
          const amount = totals[cat] || 0;
          const actualPct = total > 0 ? (amount / total) * 100 : 0;
          const target = Number.parseFloat(planTargets[cat] || "0") || 0;
          const ok = total > 0 && planCompliant(cat, actualPct, target);
          const items = breakdown[cat] || [];
          const open = openCat === cat;
          return (
            <li key={cat} className={styles.planLegendItem}>
              <button
                type="button"
                className={styles.planLegendRow}
                onClick={() => setOpenCat(open ? null : cat)}
                aria-expanded={open}
                title={buildTooltip(cat)}
              >
                <span className={styles.dot} style={{ background: CATEGORY_COLORS[cat] }} />
                <span className={styles.planLegendName}>{CATEGORY_LABELS[cat]}</span>
                <span className={styles.planLegendPct}>
                  {actualPct.toFixed(0)}% <span className={styles.planLegendTarget}>/ {target}%</span>
                </span>
                <span
                  className={ok ? styles.planOk : styles.planBad}
                  title={ok ? "Dentro del plan" : "Fuera del plan"}
                  aria-label={ok ? "Dentro del plan" : "Fuera del plan"}
                />
              </button>
              {open && (
                <ul className={styles.planLegendBreakdown}>
                  {items.length === 0 ? (
                    <li className={styles.planLegendEmpty}>Sin gastos este mes</li>
                  ) : (
                    items.map((it, i) => (
                      <li key={i} className={styles.planLegendBreakdownRow}>
                        <span className={styles.planLegendBreakdownName}>
                          <span className={it.paid ? styles.planPaidMark : styles.planPendingMark} aria-hidden="true">
                            {it.paid ? "✓" : "•"}
                          </span>
                          <span className={it.paid ? styles.planLegendPaid : ""}>{it.name}</span>
                        </span>
                        <span className={it.paid ? styles.planLegendPaid : ""}>{currency.format(it.amount)}</span>
                      </li>
                    ))
                  )}
                  <li className={styles.planLegendBreakdownTotal}>
                    <span>Total</span>
                    <span>{currency.format(amount)}</span>
                  </li>
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function BankPicker({
  value,
  onChange,
  ariaLabel,
}: {
  value: BankId | "";
  onChange: (b: BankId | "") => void;
  ariaLabel: string;
}) {
  return (
    <div className={styles.fixedBankPick} role="group" aria-label={ariaLabel}>
      {BANK_IDS.map((b) => (
        <button
          type="button"
          key={b}
          className={styles.bankPickDot}
          onClick={() => onChange(value === b ? "" : b)}
          aria-label={BANK_LABELS[b]}
          aria-pressed={value === b}
          title={BANK_LABELS[b]}
        >
          <span className={styles.bankDot} style={{ background: value === b ? BANK_COLORS[b] : "#cbd5e1" }} />
        </button>
      ))}
    </div>
  );
}

function ExpenseMatrix({
  groups,
  monthKeys,
  activeMonth,
  collapsedCategories,
  onSelectMonth,
  onSetRowBank,
  onSetRowName,
  onSetRowAmount,
  onToggleCell,
  onToggleCategory,
  onSetPlanTarget,
}: {
  groups: SummaryCategoryGroup[];
  monthKeys: string[];
  activeMonth: string;
  collapsedCategories: Set<CategoryId>;
  onSelectMonth: (key: string) => void;
  onSetRowBank: (row: SummaryRow, bank: BankId | "") => void;
  onSetRowName: (row: SummaryRow, name: string) => void;
  onSetRowAmount: (row: SummaryRow, amount: string) => void;
  onToggleCell: (row: SummaryRow, monthKey: string) => void;
  onToggleCategory: (cat: CategoryId) => void;
  onSetPlanTarget: (cat: CategoryId, value: string) => void;
}) {
  const visibleGroups = groups.filter((g) => g.rows.length > 0);
  if (monthKeys.length === 0 || visibleGroups.length === 0) return null;
  const colCount = 3 + monthKeys.length;

  return (
    <div className={styles.summaryWrap}>
      <table className={styles.summaryTable}>
        <thead>
          <tr>
            <th className={styles.summaryConceptHeader}>Concepto</th>
            <th>Importe</th>
            <th>Banco</th>
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
              {!collapsed && group.rows.map((row) => (
                <tr key={`${group.category}-${row.kind}-${row.key}`}>
                  <td className={styles.summaryConceptCell}>
                    <input
                      type="text"
                      value={row.name}
                      onChange={(ev) => onSetRowName(row, ev.target.value)}
                      className={styles.expenseInput}
                      aria-label={`Concepto de ${row.name}`}
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
  );
}

export default function HogarManager() {
  const [assets, setAssets] = useState<AssetDef[]>(DEFAULT_ASSETS);
  const [values, setValues] = useState<PortfolioValues>(DEFAULT_VALUES);
  const [contribution, setContribution] = useState("");
  const [months, setMonths] = useState<Record<string, MonthData>>({});
  const [activeMonth, setActiveMonth] = useState(currentMonthKey);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [goals, setGoals] = useState<Goal[]>([]);
  const [fixedExpenses, setFixedExpenses] = useState<FixedExpense[]>(DEFAULT_FIXED_EXPENSES);
  const [catRules, setCatRules] = useState<CategoryRule[]>([]);
  const [planTargets, setPlanTargets] = useState<Record<string, string>>({ ...PLAN_TARGETS_DEFAULT });
  const skipOnce = useRef(true);
  const activeTabRef = useRef<HTMLButtonElement>(null);
  const pendingSaveRef = useRef<string | null>(null);

  // --- Load ---
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/state");
        if (!res.ok) throw new Error("estado no disponible");
        const data = (await res.json()) as { state?: unknown };
        const state = parseState(data.state);
        if (!cancelled) {
          setAssets(state.assets);
          setValues(state.values);
          setContribution(state.contribution);
          setMonths(state.months);
          setGoals(state.goals);
          setFixedExpenses(state.fixedExpenses);
          setCatRules(state.catRules);
          setPlanTargets(state.planTargets);
          const keys = sortMonthKeys(Object.keys(state.months));
          if (keys.includes(currentMonthKey())) setActiveMonth(currentMonthKey());
          else if (keys.length > 0) setActiveMonth(keys[keys.length - 1]);
          else setActiveMonth(currentMonthKey());
          skipOnce.current = true;
          setLoadError(false);
        }
      } catch {
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [reloadKey]);

  // --- Save ---
  useEffect(() => {
    if (loading || loadError) return;
    if (skipOnce.current) { skipOnce.current = false; return; }
    const body = JSON.stringify({ assets, values, contribution, months, goals, fixedExpenses, catRules, planTargets });
    pendingSaveRef.current = body;
    const timer = setTimeout(async () => {
      setSaveStatus("saving");
      let ok = false;
      for (let i = 0; i < 2 && !ok; i++) {
        try {
          const res = await fetch("/api/state", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body,
          });
          ok = res.ok;
        } catch {
          ok = false;
        }
      }
      setSaveStatus(ok ? "saved" : "error");
    }, 500);
    return () => clearTimeout(timer);
  }, [assets, values, contribution, months, goals, fixedExpenses, catRules, planTargets, loading, loadError]);

  // Flush el último estado antes de cerrar/refrescar para no perder ediciones
  // que queden dentro de la ventana de debounce de 500 ms.
  useEffect(() => {
    const flush = () => {
      const body = pendingSaveRef.current;
      if (!body) return;
      try {
        fetch("/api/state", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: true,
        });
      } catch {
        /* ignore */
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const retryLoad = () => { setLoadError(false); setLoading(true); setReloadKey((k) => k + 1); };

  // Keep the active month tab visible in the scrollable strip
  useEffect(() => {
    activeTabRef.current?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [activeMonth]);

  // --- Months helpers ---
  const updateMonth = (patch: (m: MonthData) => MonthData) => {
    setMonths((prev) => ({ ...prev, [activeMonth]: patch(prev[activeMonth] ?? { ...EMPTY_MONTH }) }));
  };

  const activeData: MonthData = useMemo(() => months[activeMonth] ?? { ...EMPTY_MONTH }, [months, activeMonth]);

  // Banks
  const setBank = (id: BankId, v: string) => {
    if (v === "" || /^\d*\.?\d*$/.test(v)) {
      updateMonth((m) => ({ ...m, banks: { ...m.banks, [id]: v } }));
    }
  };

  const allActiveExpenses = useMemo(() => [...activeData.fixed, ...activeData.expenses], [activeData]);
  const activeDaysRemaining = daysRemaining(activeMonth);

  const bankPendientes = (bankId: BankId) => {
    return allActiveExpenses
      .filter((e) => e.bank === bankId && !e.paid)
      .reduce((s, e) => s + effectiveAmount(e, activeDaysRemaining), 0);
  };

  const bankTotal = BANK_IDS.reduce((s, id) => s + (Number.parseFloat(activeData.banks[id]) || 0), 0);
  const planTotals = categoryTotals(activeData, activeDaysRemaining);
  const expensesByCategory = CATEGORIES.reduce((acc, c) => {
    acc[c] = allActiveExpenses
      .filter((e) => e.category === c)
      .map((e) => ({ name: e.name, amount: effectiveAmount(e, activeDaysRemaining), paid: e.paid }));
    return acc;
  }, {} as Record<CategoryId, { name: string; amount: number; paid: boolean }[]>);
  const totalPendientes = allActiveExpenses.filter((e) => !e.paid).reduce((s, e) => s + effectiveAmount(e, activeDaysRemaining), 0);
  const remaining = bankTotal - totalPendientes;

  const newMonth = () => {
    const keys = sortMonthKeys(Object.keys(months));
    const lastKey = keys[keys.length - 1];
    const nextKey = lastKey ? addMonth(lastKey) : currentMonthKey();
    if (months[nextKey]) { setActiveMonth(nextKey); return; }
    const prev = months[lastKey] ?? { ...EMPTY_MONTH };
    const banks: Record<BankId, string> = { ...DEFAULT_BANKS };
    for (const id of BANK_IDS) {
      const r = bankRemaining(prev, id);
      banks[id] = r > 0 ? String(r) : "";
    }
    const carriedExpenses = prev.expenses
      .filter((e) => e.recurring)
      .map((e) => ({ ...e, id: newId(), paid: false }));
    const tmpl = fixedExpenses.length > 0 ? fixedExpenses : DEFAULT_FIXED_EXPENSES;
    const seededFixed: Expense[] = tmpl.map((f) => ({ id: f.id, name: f.name, amount: f.amount, type: "fijo", bank: f.bank, paid: false, category: f.category, recurring: true, daily: f.daily }));
    setMonths((p) => ({
      ...p,
      [nextKey]: { banks, expenses: carriedExpenses, fixed: seededFixed },
    }));
    setActiveMonth(nextKey);
  };

  const sortedMonthKeys = useMemo(() => sortMonthKeys(Object.keys(months)), [months]);

  // Month-over-month comparison (la comida diaria usa días del mes completo)
  const comparison = (() => {
    const idx = sortedMonthKeys.indexOf(activeMonth);
    if (idx <= 0) return null;
    const prevKey = sortedMonthKeys[idx - 1];
    const cur = months[activeMonth];
    const prev = months[prevKey];
    const curTotals = categoryTotals(cur, daysInMonth(activeMonth));
    const prevTotals = categoryTotals(prev, daysInMonth(prevKey));
    const cats = new Set([...Object.keys(curTotals), ...Object.keys(prevTotals)]);
    const rows = [...cats]
      .map((cat) => {
        const c = curTotals[cat] || 0;
        const p = prevTotals[cat] || 0;
        const delta = c - p;
        const pctDelta = p > 0 ? (delta / p) * 100 : c > 0 ? 100 : 0;
        return { cat: cat as CategoryId, cur: c, prev: p, delta, pctDelta };
      })
      .sort((a, b) => b.delta - a.delta);
    const curTotal = Object.values(curTotals).reduce((s, v) => s + v, 0);
    const prevTotal = Object.values(prevTotals).reduce((s, v) => s + v, 0);
    return { prevKey, rows, curTotal, prevTotal, totalDelta: curTotal - prevTotal };
  })();

  const isAnomaly = (delta: number, pctDelta: number) => delta > 0 && delta >= 20 && pctDelta >= 50;

  // Expense trends per month
  const trendsData = useMemo(() => {
    const keys = sortMonthKeys(Object.keys(months));
    if (keys.length === 0) return [];
    const last12 = keys.slice(-12);
    return last12.map((key) => {
      const m = months[key];
      const cats: Record<string, number> = {};
      if (m) {
        for (const e of [...m.fixed, ...m.expenses]) {
          cats[e.category] = (cats[e.category] || 0) + (Number.parseFloat(e.amount) || 0);
        }
      }
      return { key, label: monthLabel(key), cats };
    });
  }, [months]);

  const trendsMax = useMemo(() => {
    let mx = 0;
    for (const d of trendsData) {
      const total = Object.values(d.cats).reduce((s, v) => s + v, 0);
      if (total > mx) mx = total;
    }
    return mx || 1;
  }, [trendsData]);

  const matrixGroups = useMemo(
    () => buildExpenseMatrix(months, sortedMonthKeys, planTargets),
    [months, sortedMonthKeys, planTargets],
  );

  const [matrixBankFilter, setMatrixBankFilter] = useState<BankId | "all">("all");
  const [matrixPaidFilter, setMatrixPaidFilter] = useState<"all" | "paid" | "pending">("all");

  // El filtro de pagado/pendiente se evalúa sobre el mes activo (columna
  // resaltada), ya que el estado de pagado es por mes, no por fila.
  const filteredMatrixGroups = useMemo(() => {
    return matrixGroups.map((group) => ({
      ...group,
      rows: group.rows.filter((row) => {
        if (matrixBankFilter !== "all" && row.bank !== matrixBankFilter) return false;
        if (matrixPaidFilter !== "all" && row.cells[activeMonth]?.status !== matrixPaidFilter) return false;
        return true;
      }),
    }));
  }, [matrixGroups, matrixBankFilter, matrixPaidFilter, activeMonth]);

  // Cambiar el banco de una fila del resumen actualiza el gasto en TODOS los
  // meses donde aparece (por id si es fijo, por nombre si es variable
  // recurrente), y además la plantilla si es un gasto fijo, para que los
  // próximos meses se sigan sembrando con el banco elegido.
  // Aplica `patch` al gasto de una fila del resumen en TODOS los meses donde
  // aparece (por id si es fijo, por nombre si es variable recurrente).
  const patchRowInMonths = (
    prev: Record<string, MonthData>,
    row: SummaryRow,
    patch: (e: Expense) => Expense,
  ): Record<string, MonthData> => {
    const next: Record<string, MonthData> = {};
    for (const [key, m] of Object.entries(prev)) {
      if (row.kind === "fixed") {
        next[key] = m.fixed.some((e) => e.id === row.key)
          ? { ...m, fixed: m.fixed.map((e) => (e.id === row.key ? patch(e) : e)) }
          : m;
      } else {
        const norm = row.key;
        next[key] = m.expenses.some((e) => e.recurring && e.name.trim().toLowerCase() === norm)
          ? { ...m, expenses: m.expenses.map((e) => (e.recurring && e.name.trim().toLowerCase() === norm ? patch(e) : e)) }
          : m;
      }
    }
    return next;
  };

  const setRowBank = (row: SummaryRow, bank: BankId | "") => {
    if (row.kind === "fixed") {
      setFixedExpenses((prev) => prev.map((f) => (f.id === row.key ? { ...f, bank } : f)));
    }
    setMonths((prev) => patchRowInMonths(prev, row, (e) => ({ ...e, bank })));
  };

  const setRowName = (row: SummaryRow, name: string) => {
    if (row.kind === "fixed") {
      setFixedExpenses((prev) => prev.map((f) => (f.id === row.key ? { ...f, name } : f)));
    }
    setMonths((prev) => patchRowInMonths(prev, row, (e) => ({ ...e, name })));
  };

  const setRowAmount = (row: SummaryRow, amount: string) => {
    if (row.kind === "fixed") {
      setFixedExpenses((prev) => prev.map((f) => (f.id === row.key ? { ...f, amount } : f)));
    }
    setMonths((prev) => patchRowInMonths(prev, row, (e) => ({ ...e, amount })));
  };

  // Alterna pagado/pendiente de un gasto en un mes concreto (no afecta a
  // los demás meses de la fila, a diferencia de banco/nombre/importe).
  const toggleCellPaid = (row: SummaryRow, monthKey: string) => {
    setMonths((prev) => {
      const m = prev[monthKey];
      if (!m) return prev;
      if (row.kind === "fixed") {
        if (!m.fixed.some((e) => e.id === row.key)) return prev;
        return { ...prev, [monthKey]: { ...m, fixed: m.fixed.map((e) => (e.id === row.key ? { ...e, paid: !e.paid } : e)) } };
      }
      const norm = row.key;
      if (!m.expenses.some((e) => e.recurring && e.name.trim().toLowerCase() === norm)) return prev;
      return {
        ...prev,
        [monthKey]: { ...m, expenses: m.expenses.map((e) => (e.recurring && e.name.trim().toLowerCase() === norm ? { ...e, paid: !e.paid } : e)) },
      };
    });
  };

  const [collapsedCategories, setCollapsedCategories] = useState<Set<CategoryId>>(new Set());
  const toggleCategory = (cat: CategoryId) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const setPlanTarget = (cat: CategoryId, value: string) => {
    setPlanTargets((prev) => ({ ...prev, [cat]: value }));
  };

  // Notifications
  // `Notification` es una API solo de navegador: su comprobación no puede
  // decidir el render inicial (server no la tiene) sin provocar un mismatch
  // de hidratación, así que se resuelve en un efecto tras montar.
  const [notifSupported, setNotifSupported] = useState(false);
  const [notifEnabled, setNotifEnabled] = useState(false);
  const notifSentRef = useRef(false);

  useEffect(() => {
    if (typeof Notification === "undefined") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- puente deliberado desde la API de navegador (no disponible en el render de servidor) hacia estado de React tras montar.
    setNotifSupported(true);
    setNotifEnabled(Notification.permission === "granted");
  }, []);

  useEffect(() => {
    if (!notifEnabled || notifSentRef.current) return;
    if (typeof Notification === "undefined") return;
    if (remaining < 0) {
      new Notification("Hogar", { body: `Disponible negativo: ${currency.format(remaining)}` });
      notifSentRef.current = true;
    }
  }, [notifEnabled, remaining]);

  const requestNotifications = async () => {
    if (typeof Notification === "undefined") return;
    const perm = await Notification.requestPermission();
    if (perm === "granted") {
      setNotifEnabled(true);
      notifSentRef.current = false;
    }
  };

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <header className={styles.header}>
          <h1>Hogar</h1>
          {saveStatus !== "idle" && (
            <p className={styles.saveStatus} role="status">
              {saveStatus === "saving" ? "Guardando…" : saveStatus === "saved" ? "Guardado" : "Error al guardar"}
            </p>
          )}
          {notifSupported && !notifEnabled && Notification.permission !== "denied" && (
            <button type="button" className={styles.notifBtn} onClick={requestNotifications} title="Activar notificaciones">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              Notificaciones
            </button>
          )}
        </header>

        {loading ? (
          <section className={styles.card}><p className={styles.empty}>Cargando…</p></section>
        ) : loadError ? (
          <section className={styles.card}>
            <p className={styles.empty}>No se pudo cargar el estado guardado.</p>
            <button type="button" className={styles.addBtn} onClick={retryLoad}>Reintentar</button>
          </section>
        ) : (
          <>
            {/* Month selector */}
            <div className={styles.monthTabs}>
              {sortedMonthKeys.map((key) => (
                <button key={key} type="button" ref={key === activeMonth ? activeTabRef : undefined} className={`${styles.monthTab} ${key === activeMonth ? styles.monthTabActive : ""}`} onClick={() => setActiveMonth(key)}>
                  {monthLabel(key)}
                  {key === activeMonth && activeMonth === currentMonthKey() && <span className={styles.daysLeft}> · {activeDaysRemaining} días restantes</span>}
                </button>
              ))}
              <button type="button" className={styles.newMonthBtn} onClick={newMonth}>+ Nuevo mes</button>
            </div>

            {/* Resumen multi-mes */}
            <section className={styles.card}>
              <h2>Resumen por mes</h2>
              <div className={styles.filterBar}>
                <select
                  value={matrixBankFilter}
                  onChange={(ev) => setMatrixBankFilter(ev.target.value as BankId | "all")}
                  className={styles.expenseSelect}
                  aria-label="Filtrar por banco"
                >
                  <option value="all">Todos los bancos</option>
                  {BANK_IDS.map((b) => <option key={b} value={b}>{BANK_LABELS[b]}</option>)}
                </select>
                <select
                  value={matrixPaidFilter}
                  onChange={(ev) => setMatrixPaidFilter(ev.target.value as "all" | "paid" | "pending")}
                  className={styles.expenseSelect}
                  aria-label="Filtrar por estado de pago del mes activo"
                >
                  <option value="all">Pagados y pendientes</option>
                  <option value="paid">Solo pagados ({monthShortLabel(activeMonth)})</option>
                  <option value="pending">Solo pendientes ({monthShortLabel(activeMonth)})</option>
                </select>
              </div>
              <ExpenseMatrix
                groups={filteredMatrixGroups}
                monthKeys={sortedMonthKeys}
                activeMonth={activeMonth}
                collapsedCategories={collapsedCategories}
                onSelectMonth={setActiveMonth}
                onSetRowBank={setRowBank}
                onSetRowName={setRowName}
                onSetRowAmount={setRowAmount}
                onToggleCell={toggleCellPaid}
                onToggleCategory={toggleCategory}
                onSetPlanTarget={setPlanTarget}
              />
              <p className={styles.note}>Los gastos puntuales no recurrentes no aparecen aquí.</p>
            </section>

            {/* Banks */}
            <section className={styles.card}>
              <h2>Bancos</h2>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead><tr><th>Banco</th><th>Saldo</th><th>Gastos</th><th>Disponible</th></tr></thead>
                  <tbody>
                    {BANK_IDS.map((id) => {
                      const saldo = Number.parseFloat(activeData.banks[id]) || 0;
                      const gastos = bankPendientes(id);
                      const rest = saldo - gastos;
                      const pendItems = allActiveExpenses.filter((e) => e.bank === id && !e.paid);
                      const pendLines = pendItems.map((e) => `${e.name}: ${currency.format(effectiveAmount(e, activeDaysRemaining))}`);
                      const bankTitle = pendLines.length ? `Pendientes en ${BANK_LABELS[id]}:\n${pendLines.join("\n")}` : `Sin pendientes en ${BANK_LABELS[id]}`;
                      return (
                        <tr key={id}>
                          <td className={styles.cellName}>{BANK_LABELS[id]}</td>
                          <td><input type="text" inputMode="decimal" value={activeData.banks[id]} onChange={(e) => setBank(id, e.target.value)} placeholder="0" className={styles.expenseInput} aria-label={`Saldo ${BANK_LABELS[id]}`} /></td>
                          <td title={bankTitle}>{currency.format(gastos)}</td>
                          <td className={rest >= 0 ? styles.inject : styles.negative}>{currency.format(rest)}</td>
                        </tr>
                      );
                    })}
                    <tr className={styles.totalRow}>
                      <td>Total</td>
                      <td>{currency.format(bankTotal)}</td>
                      <td>{currency.format(totalPendientes)}</td>
                      <td className={remaining >= 0 ? styles.inject : styles.negative}>{currency.format(remaining)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className={`${styles.disponibleTotal} ${remaining >= 0 ? styles.inject : styles.negative}`}>Disponible total: {currency.format(remaining)} €</p>
            </section>

            {/* Plan de hogar */}
            <section className={styles.card}>
              <h2>Plan de hogar</h2>
              <PlanDonut totals={planTotals} planTargets={planTargets} breakdown={expensesByCategory} currency={currency} />
            </section>

            {trendsData.length > 1 && (
              <section className={styles.card}>
                <h2>Tendencia de gastos</h2>
                <div className={styles.trendsChart}>
                  {trendsData.map((d) => {
                    const cats = Object.entries(d.cats);
                    const total = cats.reduce((s, [, v]) => s + v, 0);
                    const barH = (total / trendsMax) * 100;
                    let cumY = 0;
                    return (
                      <div key={d.key} className={styles.trendBar}>
                        <div className={styles.trendBarInner} style={{ height: `${barH}%` }}>
                          {cats.map(([cat, val]) => {
                            const h = total > 0 ? (val / total) * 100 : 0;
                            const y = cumY;
                            cumY += h;
                            return <div key={cat} className={styles.trendSeg} style={{ bottom: `${y}%`, height: `${h}%`, background: CATEGORY_COLORS[cat as CategoryId] }} title={`${CATEGORY_LABELS[cat as CategoryId]}: ${currency.format(val)}`} />;
                          })}
                        </div>
                        <span className={styles.trendLabel}>{d.key.slice(5)}</span>
                      </div>
                    );
                  })}
                </div>
                <div className={styles.legend}>
                  {CATEGORIES.filter((c) => trendsData.some((d) => d.cats[c] > 0)).map((c) => (
                    <span key={c} className={styles.legendItem}>
                      <span className={styles.dot} style={{ background: CATEGORY_COLORS[c] }} />
                      {CATEGORY_LABELS[c]}
                    </span>
                  ))}
                </div>
              </section>
            )}

            {comparison && (
              <section className={styles.card}>
                <h2>Comparativa con {monthLabel(comparison.prevKey)}</h2>
                <p className={styles.note}>
                  Este mes: {currency.format(comparison.curTotal)} € · Mes anterior: {currency.format(comparison.prevTotal)} € · {" "}
                  <span className={comparison.totalDelta > 0 ? styles.negative : styles.inject}>
                    Δ {comparison.totalDelta >= 0 ? "+" : ""}{currency.format(comparison.totalDelta)} €
                  </span>
                </p>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead><tr><th>Categoría</th><th>Este mes</th><th>Mes anterior</th><th>Δ</th><th>%</th></tr></thead>
                    <tbody>
                      {comparison.rows.map((r) => (
                        <tr key={r.cat} className={isAnomaly(r.delta, r.pctDelta) ? styles.anomaly : ""}>
                          <td className={styles.cellName}><span className={styles.dot} style={{ background: CATEGORY_COLORS[r.cat] }} />{CATEGORY_LABELS[r.cat]}</td>
                          <td>{currency.format(r.cur)}</td>
                          <td>{currency.format(r.prev)}</td>
                          <td className={r.delta > 0 ? styles.negative : styles.inject}>{r.delta >= 0 ? "+" : ""}{currency.format(r.delta)}</td>
                          <td className={r.delta > 0 ? styles.negative : styles.inject}>{r.pctDelta >= 0 ? "+" : ""}{pct.format(r.pctDelta)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
