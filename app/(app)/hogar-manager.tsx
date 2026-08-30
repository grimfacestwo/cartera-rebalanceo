"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AssetDef } from "@/lib/rebalance";
import { buildExpenseMatrix, type SummaryRow } from "@/lib/matrix";
import { putState } from "@/lib/persist";
import {
  addFixedRowToTemplate,
  computeMovedRowOrder,
  deleteRowFromMonths,
  deleteRowFromTemplate,
  patchRowInMonths,
  patchRowTemplate,
  seedFixedRowIntoMonths,
  toggleCellPaid as toggleCellPaidInMonths,
} from "@/lib/rows";
import {
  BANK_IDS,
  BANK_LABELS,
  CATEGORY_LABELS,
  CATEGORY_COLORS,
  CATEGORIES,
  DEFAULT_ASSETS,
  DEFAULT_VALUES,
  DEFAULT_BANKS,
  categoryTotals,
  currentMonthKey,
  daysInMonth,
  daysRemaining,
  effectiveAmount,
  expenseAppliesToMonth,
  DEFAULT_FIXED_EXPENSES,
  monthLabel,
  monthShortLabel,
  parseState,
  PLAN_TARGETS_DEFAULT,
  sortMonthKeys,
  type BankId,
  type CategoryId,
  type CategoryRule,
  type FixedExpense,
  type Goal,
  type MonthData,
  type PortfolioState,
  type PortfolioValues,
} from "@/lib/state";
import { PlanDonut } from "./hogar-plan-donut";
import { ExpenseMatrix } from "./hogar-expense-matrix";
import styles from "./hogar.module.css";

const currency = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const pct = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 });

type SaveStatus = "idle" | "saving" | "saved" | "error" | "conflict";

const EMPTY_MONTH: MonthData = { banks: { ...DEFAULT_BANKS }, expenses: [], fixed: [] };

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `n${Date.now()}`;
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
  const [rowOrder, setRowOrder] = useState<string[]>([]);
  const skipOnce = useRef(true);
  const pendingStateRef = useRef<PortfolioState | null>(null);
  // Última versión conocida del estado en el servidor. Viaja en cada
  // guardado para detectar si otra pestaña/página guardó de por medio (ver
  // lib/persist.ts y app/api/state/route.ts) — evita que "el último que
  // guarda gana" pise ediciones ajenas en silencio.
  const lastVersionRef = useRef<number | null>(null);

  const applyServerState = (state: PortfolioState) => {
    setAssets(state.assets);
    setValues(state.values);
    setContribution(state.contribution);
    setMonths(state.months);
    setGoals(state.goals);
    setFixedExpenses(state.fixedExpenses);
    setCatRules(state.catRules);
    setPlanTargets(state.planTargets);
    setRowOrder(state.rowOrder);
    skipOnce.current = true;
  };

  // --- Load ---
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/state");
        if (!res.ok) throw new Error("estado no disponible");
        const data = (await res.json()) as { state?: unknown; version?: number | null };
        const state = parseState(data.state);
        if (!cancelled) {
          applyServerState(state);
          lastVersionRef.current = data.version ?? null;
          const keys = sortMonthKeys(Object.keys(state.months));
          if (keys.includes(currentMonthKey())) setActiveMonth(currentMonthKey());
          else if (keys.length > 0) setActiveMonth(keys[keys.length - 1]);
          else setActiveMonth(currentMonthKey());
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
    const state: PortfolioState = { assets, values, contribution, months, goals, fixedExpenses, catRules, planTargets, rowOrder };
    pendingStateRef.current = state;
    const timer = setTimeout(async () => {
      setSaveStatus("saving");
      let result = await putState(state, lastVersionRef.current);
      if (result.kind === "error") result = await putState(state, lastVersionRef.current); // 1 reintento
      if (result.kind === "ok") {
        lastVersionRef.current = result.version;
        setSaveStatus("saved");
      } else if (result.kind === "conflict") {
        // Alguien más guardó de por medio: se adopta su versión en vez de
        // sobrescribirla, y se avisa — más honesto que perder datos ajenos
        // en silencio.
        applyServerState(result.state);
        lastVersionRef.current = result.version;
        setSaveStatus("conflict");
      } else {
        setSaveStatus("error");
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [assets, values, contribution, months, goals, fixedExpenses, catRules, planTargets, rowOrder, loading, loadError]);

  // Flush el último estado antes de cerrar/refrescar para no perder ediciones
  // que queden dentro de la ventana de debounce de 500 ms.
  useEffect(() => {
    const flush = () => {
      const state = pendingStateRef.current;
      if (!state) return;
      putState(state, lastVersionRef.current, { keepalive: true }).then((result) => {
        if (result.kind === "ok" || result.kind === "conflict") lastVersionRef.current = result.version;
      });
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

  // Los gastos con mensualidad personalizada que no aplican este mes (ver
  // columna "Mensualidad" del resumen) no cuentan para pagado/pendiente/
  // disponible de este mes, igual que en el resumen se marcan "na".
  const allActiveExpenses = useMemo(
    () => [...activeData.fixed, ...activeData.expenses].filter((e) => expenseAppliesToMonth(e, activeMonth)),
    [activeData, activeMonth],
  );
  const activeDaysRemaining = daysRemaining(activeMonth);

  const bankPendientes = (bankId: BankId) => {
    return allActiveExpenses
      .filter((e) => e.bank === bankId && !e.paid)
      .reduce((s, e) => s + effectiveAmount(e, activeDaysRemaining), 0);
  };

  const bankPagado = (bankId: BankId) => {
    return allActiveExpenses
      .filter((e) => e.bank === bankId && e.paid)
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
  const totalPagado = allActiveExpenses.filter((e) => e.paid).reduce((s, e) => s + effectiveAmount(e, activeDaysRemaining), 0);
  const remaining = bankTotal - totalPendientes;

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
    () => buildExpenseMatrix(months, sortedMonthKeys, planTargets, rowOrder),
    [months, sortedMonthKeys, planTargets, rowOrder],
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

  // Cambiar el banco/nombre/importe/mensualidad de una fila del resumen
  // actualiza el gasto en TODOS los meses donde aparece (por id si es fijo,
  // por nombre si es variable recurrente), y además la plantilla si es un
  // gasto fijo, para que los próximos meses se sigan sembrando igual. La
  // lógica pura vive en lib/rows.ts (testeada ahí); aquí solo se conecta al
  // estado de React.
  const setRowBank = (row: SummaryRow, bank: BankId | "") => {
    setFixedExpenses((prev) => patchRowTemplate(prev, row, (f) => ({ ...f, bank })));
    setMonths((prev) => patchRowInMonths(prev, row, (e) => ({ ...e, bank })));
  };

  const setRowName = (row: SummaryRow, name: string) => {
    setFixedExpenses((prev) => patchRowTemplate(prev, row, (f) => ({ ...f, name })));
    setMonths((prev) => patchRowInMonths(prev, row, (e) => ({ ...e, name })));
  };

  const setRowAmount = (row: SummaryRow, amount: string) => {
    setFixedExpenses((prev) => patchRowTemplate(prev, row, (f) => ({ ...f, amount })));
    setMonths((prev) => patchRowInMonths(prev, row, (e) => ({ ...e, amount })));
  };

  const setRowMonths = (row: SummaryRow, monthsSpec: string) => {
    setFixedExpenses((prev) => patchRowTemplate(prev, row, (f) => ({ ...f, months: monthsSpec })));
    setMonths((prev) => patchRowInMonths(prev, row, (e) => ({ ...e, months: monthsSpec })));
  };

  // Alterna pagado/pendiente de un gasto en un mes concreto (no afecta a
  // los demás meses de la fila, a diferencia de banco/nombre/importe).
  const toggleCellPaid = (row: SummaryRow, monthKey: string) => {
    setMonths((prev) => toggleCellPaidInMonths(prev, row, monthKey));
  };

  // Añade un gasto fijo nuevo: entra en la plantilla y se siembra al
  // instante en todos los meses ya creados (igual que hace parseState al
  // cargar), para que la nueva fila aparezca ya en el resumen sin recargar.
  const addFixedRow = (input: { name: string; amount: string; bank: BankId | ""; category: CategoryId; months: string }) => {
    const newRow = { id: newId(), ...input };
    setFixedExpenses((prev) => addFixedRowToTemplate(prev, newRow));
    setMonths((prev) => seedFixedRowIntoMonths(prev, newRow));
  };

  // Elimina el gasto de una fila del resumen de TODOS los meses donde
  // aparece (y de la plantilla si es fijo), igual que las demás ediciones
  // "globales" de fila (banco/nombre/importe).
  const deleteRow = (row: SummaryRow) => {
    setFixedExpenses((prev) => deleteRowFromTemplate(prev, row));
    setMonths((prev) => deleteRowFromMonths(prev, row));
    setRowOrder((prev) => prev.filter((k) => k !== row.key));
  };

  // Mueve una fila un puesto arriba/abajo dentro de su categoría; ver
  // computeMovedRowOrder en lib/rows.ts para la lógica de qué vecino usar.
  const moveRow = (row: SummaryRow, direction: "up" | "down") => {
    const newOrder = computeMovedRowOrder(matrixGroups, filteredMatrixGroups, row, direction);
    if (newOrder) setRowOrder(newOrder);
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
              {saveStatus === "saving"
                ? "Guardando…"
                : saveStatus === "saved"
                  ? "Guardado"
                  : saveStatus === "conflict"
                    ? "Actualizado desde otra pestaña — se descartó el cambio sin guardar"
                    : "Error al guardar"}
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
            {/* Resumen multi-mes */}
            <section className={styles.card}>
              <h2>
                Resumen por mes
                {activeMonth === currentMonthKey() && ` (${activeDaysRemaining} días restantes)`}
              </h2>
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
                activeDaysRemaining={activeDaysRemaining}
                collapsedCategories={collapsedCategories}
                onSelectMonth={setActiveMonth}
                onSetRowBank={setRowBank}
                onSetRowName={setRowName}
                onSetRowAmount={setRowAmount}
                onSetRowMonths={setRowMonths}
                onToggleCell={toggleCellPaid}
                onToggleCategory={toggleCategory}
                onSetPlanTarget={setPlanTarget}
                onMoveRow={moveRow}
                onDeleteRow={deleteRow}
                onAddRow={addFixedRow}
              />
              <p className={styles.note}>Los gastos puntuales no recurrentes no aparecen aquí.</p>
            </section>

            {/* Banks */}
            <section className={styles.card}>
              <h2>Bancos</h2>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead><tr><th>Banco</th><th>Saldo</th><th>Pagado</th><th>Pendiente</th><th>Disponible</th></tr></thead>
                  <tbody>
                    {BANK_IDS.map((id) => {
                      const saldo = Number.parseFloat(activeData.banks[id]) || 0;
                      const pendiente = bankPendientes(id);
                      const pagado = bankPagado(id);
                      const rest = saldo - pendiente;
                      const pendItems = allActiveExpenses.filter((e) => e.bank === id && !e.paid);
                      const pendLines = pendItems.map((e) => `${e.name}: ${currency.format(effectiveAmount(e, activeDaysRemaining))}`);
                      const pendingTitle = pendLines.length ? `Pendientes en ${BANK_LABELS[id]}:\n${pendLines.join("\n")}` : `Sin pendientes en ${BANK_LABELS[id]}`;
                      const paidItems = allActiveExpenses.filter((e) => e.bank === id && e.paid);
                      const paidLines = paidItems.map((e) => `${e.name}: ${currency.format(effectiveAmount(e, activeDaysRemaining))}`);
                      const paidTitle = paidLines.length ? `Pagados en ${BANK_LABELS[id]}:\n${paidLines.join("\n")}` : `Sin pagados en ${BANK_LABELS[id]}`;
                      return (
                        <tr key={id}>
                          <td className={styles.cellName}>{BANK_LABELS[id]}</td>
                          <td><input type="text" inputMode="decimal" value={activeData.banks[id]} onChange={(e) => setBank(id, e.target.value)} placeholder="0" className={styles.expenseInput} aria-label={`Saldo ${BANK_LABELS[id]}`} /></td>
                          <td title={paidTitle}>{currency.format(pagado)}</td>
                          <td title={pendingTitle}>{currency.format(pendiente)}</td>
                          <td className={rest >= 0 ? styles.inject : styles.negative}>{currency.format(rest)}</td>
                        </tr>
                      );
                    })}
                    <tr className={styles.totalRow}>
                      <td>Total</td>
                      <td>{currency.format(bankTotal)}</td>
                      <td>{currency.format(totalPagado)}</td>
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
