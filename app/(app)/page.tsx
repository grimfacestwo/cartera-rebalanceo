"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { computePlan, type AssetDef, type Row } from "@/lib/rebalance";
import {
  BANK_IDS,
  BANK_LABELS,
  DEFAULT_ASSETS,
  DEFAULT_VALUES,
  DEFAULT_BANKS,
  PALETTE,
  addMonth,
  bankRemaining,
  comidaAmount,
  currentMonthKey,
  daysRemaining,
  monthLabel,
  parseState,
  sortMonthKeys,
  type BankId,
  type Expense,
  type MonthData,
  type PortfolioValues,
} from "@/lib/state";
import styles from "./page.module.css";

const currency = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const pct = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 });

type SaveStatus = "idle" | "saving" | "saved" | "error";
type TabId = "cartera" | "hogar";

const EMPTY_MONTH: MonthData = { banks: { ...DEFAULT_BANKS }, expenses: [], comidaDaily: "40", comidaBank: "ing" };

function nextColor(assets: AssetDef[]): string {
  const used = new Set(assets.map((a) => a.color));
  return PALETTE.find((c) => !used.has(c)) ?? `hsl(${(assets.length * 47) % 360} 70% 55%)`;
}

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `n${Date.now()}`;
}

export default function Home() {
  const [assets, setAssets] = useState<AssetDef[]>(DEFAULT_ASSETS);
  const [values, setValues] = useState<PortfolioValues>(DEFAULT_VALUES);
  const [contribution, setContribution] = useState("");
  const [months, setMonths] = useState<Record<string, MonthData>>({});
  const [activeMonth, setActiveMonth] = useState(currentMonthKey);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newTarget, setNewTarget] = useState("");
  const [tab, setTab] = useState<TabId>("cartera");
  const [newExpName, setNewExpName] = useState("");
  const [newExpAmount, setNewExpAmount] = useState("");
  const [newExpType, setNewExpType] = useState<"fijo" | "variable">("variable");
  const skipOnce = useRef(true);

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
          const keys = sortMonthKeys(Object.keys(state.months));
          if (keys.length > 0) setActiveMonth(keys[keys.length - 1]);
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
    const timer = setTimeout(() => {
      setSaveStatus("saving");
      fetch("/api/state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assets, values, contribution, months }),
      })
        .then((res) => setSaveStatus(res.ok ? "saved" : "error"))
        .catch(() => setSaveStatus("error"));
    }, 500);
    return () => clearTimeout(timer);
  }, [assets, values, contribution, months, loading, loadError]);

  const retryLoad = () => { setLoadError(false); setLoading(true); setReloadKey((k) => k + 1); };

  // --- Cartera logic (unchanged) ---
  const plan = useMemo(() => {
    const parsed = Object.fromEntries(assets.map((a) => [a.id, Number.parseFloat(values[a.id]) || 0]));
    return computePlan(assets, parsed, Number.parseFloat(contribution) || 0);
  }, [assets, values, contribution]);

  const { rows, total, extra, fullNeed, targetSum, aligned, covered } = plan;
  const hasValues = rows.some((r) => r.value > 0);

  const totalRow: Row = {
    id: "total", name: "Total", color: "#64748b", value: total, w: 1, r: 0,
    currentPct: 100, targetPct: 100, toAlign: fullNeed, allocation: extra,
  };
  const tableRows = hasValues ? [...rows, totalRow] : [];

  const setValue = (id: string, v: string) => {
    if (v === "" || /^\d*\.?\d*$/.test(v)) setValues({ ...values, [id]: v });
  };

  const changeTarget = (id: string, v: string) => {
    if (v === "" || /^\d{0,3}(\.\d{0,2})?$/.test(v)) {
      const n = Number.parseFloat(v);
      if (v === "" || (Number.isFinite(n) && n >= 0 && n <= 100)) {
        setAssets(assets.map((a) => (a.id === id ? { ...a, targetPct: v === "" ? 0 : n } : a)));
      }
    }
  };

  const handleAddAsset = () => {
    const name = newName.trim();
    const t = Number.parseFloat(newTarget);
    if (!name || !Number.isFinite(t) || t <= 0 || t > 100) return;
    setAssets([...assets, { id: newId(), name, targetPct: t, color: nextColor(assets) }]);
    setNewName(""); setNewTarget("");
  };

  const handleRemoveAsset = (id: string) => {
    setAssets(assets.filter((a) => a.id !== id));
    setValues(Object.fromEntries(Object.entries(values).filter(([k]) => k !== id)));
  };

  const handleReset = () => {
    if (!window.confirm("¿Restablecer todos los valores guardados?")) return;
    setAssets(DEFAULT_ASSETS); setValues({ ...DEFAULT_VALUES }); setContribution("");
  };

  // --- Months helpers ---
  const updateMonth = (patch: (m: MonthData) => MonthData) => {
    setMonths((prev) => ({ ...prev, [activeMonth]: patch(prev[activeMonth] ?? { ...EMPTY_MONTH }) }));
  };

  const activeData: MonthData = months[activeMonth] ?? { ...EMPTY_MONTH };

  // Banks
  const setBank = (id: BankId, v: string) => {
    if (v === "" || /^\d*\.?\d*$/.test(v)) {
      updateMonth((m) => ({ ...m, banks: { ...m.banks, [id]: v } }));
    }
  };

  const bankExpenses = (bankId: BankId) => {
    const exp = activeData.expenses.reduce((s, e) => e.bank === bankId ? s + (Number.parseFloat(e.amount) || 0) : s, 0);
    return exp + (activeData.comidaBank === bankId ? activeComida : 0);
  };

  const bankPendientes = (bankId: BankId) => {
    const pen = activeData.expenses.filter((e) => e.bank === bankId && !e.paid).reduce((s, e) => s + (Number.parseFloat(e.amount) || 0), 0);
    return pen + (activeData.comidaBank === bankId ? activeComida : 0);
  };

  const bankTotal = BANK_IDS.reduce((s, id) => s + (Number.parseFloat(activeData.banks[id]) || 0), 0);
  const totalExpensesBank = activeData.expenses.reduce((s, e) => s + (Number.parseFloat(e.amount) || 0), 0);
  const activeDaysRemaining = daysRemaining(activeMonth);
  const activeComida = comidaAmount(activeData, activeMonth);
  const totalExpenses = totalExpensesBank + activeComida;
  const remaining = bankTotal - totalExpenses;

  // Expenses
  const setExpField = (id: string, field: keyof Expense, val: unknown) => {
    updateMonth((m) => ({
      ...m,
      expenses: m.expenses.map((e) => (e.id === id ? { ...e, [field]: val } : e)),
    }));
  };

  const addExpense = () => {
    const name = newExpName.trim();
    if (!name || newExpAmount === "") return;
    updateMonth((m) => ({
      ...m,
      expenses: [...m.expenses, { id: newId(), name, amount: newExpAmount, type: newExpType, bank: "ing", paid: false }],
    }));
    setNewExpName(""); setNewExpAmount(""); setNewExpType("variable");
  };

  const removeExpense = (id: string) => {
    updateMonth((m) => ({ ...m, expenses: m.expenses.filter((e) => e.id !== id) }));
  };

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
    setMonths((p) => {
      const prevMonth = lastKey ? p[lastKey] : undefined;
      return { ...p, [nextKey]: { banks, expenses: [], comidaDaily: prevMonth?.comidaDaily ?? "40", comidaBank: prevMonth?.comidaBank ?? "ing" } };
    });
    setActiveMonth(nextKey);
  };

  const setComidaDaily = (v: string) => {
    if (v === "" || /^\d*\.?\d*$/.test(v)) {
      updateMonth((m) => ({ ...m, comidaDaily: v }));
    }
  };

  const setComidaBank = (v: BankId | "") => {
    updateMonth((m) => ({ ...m, comidaBank: v }));
  };

  const sortedMonthKeys = sortMonthKeys(Object.keys(months));
  const activeExpenses = activeData.expenses;
  const totalFijos = activeExpenses.filter((e) => e.type === "fijo").reduce((s, e) => s + (Number.parseFloat(e.amount) || 0), 0);
  const pagados = activeExpenses.filter((e) => e.paid).length;
  const totalPendientes = activeExpenses.filter((e) => !e.paid).reduce((s, e) => s + (Number.parseFloat(e.amount) || 0), 0) + activeComida;
  const sortedExpenses = useMemo(() => [...activeExpenses].sort((a, b) => Number(a.paid) - Number(b.paid)), [activeExpenses]);

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <header className={styles.header}>
          {tab === "cartera" && (
            <button type="button" className={styles.gear} onClick={() => setSettingsOpen(true)} aria-label="Ajustes" title="Ajustes">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
          )}
          <h1>Cartera Rebalanceo</h1>
          {saveStatus !== "idle" && (
            <p className={styles.saveStatus} role="status">
              {saveStatus === "saving" ? "Guardando…" : saveStatus === "saved" ? "Guardado" : "Error al guardar"}
            </p>
          )}
        </header>

        <nav className={styles.tabs} role="tablist">
          <button type="button" role="tab" aria-selected={tab === "cartera"} className={`${styles.tab} ${tab === "cartera" ? styles.tabActive : ""}`} onClick={() => setTab("cartera")}>Cartera</button>
          <button type="button" role="tab" aria-selected={tab === "hogar"} className={`${styles.tab} ${tab === "hogar" ? styles.tabActive : ""}`} onClick={() => setTab("hogar")}>Hogar</button>
        </nav>

        {loading ? (
          <section className={styles.card}><p className={styles.empty}>Cargando…</p></section>
        ) : loadError ? (
          <section className={styles.card}>
            <p className={styles.empty}>No se pudo cargar el estado guardado.</p>
            <button type="button" className={styles.addBtn} onClick={retryLoad}>Reintentar</button>
          </section>
        ) : tab === "cartera" ? (
          <>
            <p className={styles.subtitle}>Asignación objetivo: {assets.map((a) => `${a.name} ${pct.format(a.targetPct)}%`).join(" · ")}</p>
            <p className={styles.subtitle}>Estrategia: nunca vendas; inyecta nuevo capital en los activos desfasados.</p>
            <section className={styles.grid}>
              <div className={styles.card}>
                <h2>Valores actuales (EUR)</h2>
                {assets.map((a) => (
                  <label key={a.id} className={styles.field}>
                    <span className={styles.fieldName}>
                      <span className={styles.dot} style={{ background: a.color }} />
                      {a.name}
                      <em>{pct.format(a.targetPct)}%</em>
                    </span>
                    <input type="text" inputMode="decimal" value={values[a.id] ?? ""} onChange={(e) => setValue(a.id, e.target.value)} aria-label={`Valor actual de ${a.name}`} />
                  </label>
                ))}
                <label className={styles.field}>
                  <span className={styles.fieldName}>
                    <span className={styles.dot} style={{ background: "#22c55e" }} />
                    Aportación extra (opcional)
                  </span>
                  <input type="text" inputMode="decimal" value={contribution} onChange={(e) => { if (e.target.value === "" || /^\d*\.?\d*$/.test(e.target.value)) setContribution(e.target.value); }} placeholder="0" aria-label="Aportación extra" />
                </label>
              </div>
              <div className={styles.card}>
                <h2>Resultado</h2>
                {!hasValues ? (
                  <p className={styles.empty}>Introduce el valor de cada posición para ver cuánto inyectar.</p>
                ) : (
                  <>
                    <div className={styles.tableWrap}>
                      <table className={styles.table}>
                        <thead><tr><th>Activo</th><th>Actual</th><th>% actual</th><th>Objetivo</th><th>Inyectar (alinear)</th><th>Aportación</th></tr></thead>
                        <tbody>
                          {tableRows.map((r) => {
                            const isTotal = r.id === "total";
                            const needAlign = r.toAlign > Math.max(0.01, total * 0.001);
                            const hasAlloc = extra > 0 && r.allocation > 0.01;
                            return (
                              <tr key={r.id} className={isTotal ? styles.totalRow : ""}>
                                <td><span className={styles.cellName}><span className={styles.dot} style={{ background: r.color }} />{r.name}</span></td>
                                <td>{currency.format(r.value)}</td>
                                <td>{r.currentPct.toFixed(1)}%</td>
                                <td>{isTotal ? "100%" : `${r.targetPct.toFixed(1)}%`}</td>
                                <td>{isTotal ? <span className={styles.plain}>{aligned ? "—" : currency.format(r.toAlign)}</span> : needAlign ? <span className={styles.inject}>Inyectar {currency.format(r.toAlign)}</span> : <span className={styles.plain}>—</span>}</td>
                                <td>{isTotal ? <span className={styles.plain}>{extra > 0 ? currency.format(r.allocation) : "—"}</span> : hasAlloc ? <span className={styles.inject}>{currency.format(r.allocation)}</span> : <span className={styles.plain}>—</span>}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {aligned && extra === 0 && <p className={styles.balanced}>Tu cartera ya está alineada con la asignación objetivo.</p>}
                    {aligned && extra > 0 && <p className={styles.balanced}>Cartera alineada; la aportación se reparte según el objetivo.</p>}
                    {!aligned && extra === 0 && <p className={styles.balanced}>Necesitas inyectar {currency.format(fullNeed)} para alinear la cartera.</p>}
                    {!aligned && extra > 0 && extra >= fullNeed && <p className={styles.balanced}>Con tu aportación alineas la cartera{extra - fullNeed > 0.5 ? ` y sobran ${currency.format(extra - fullNeed)}` : ""}.</p>}
                    {!aligned && extra > 0 && extra < fullNeed && <p className={styles.balanced}>Tu aportación cubre el {covered}% de lo necesario; faltan {currency.format(fullNeed - extra)}.</p>}
                  </>
                )}
              </div>
            </section>
            {hasValues && (
              <section className={styles.card}>
                <h2>Distribución</h2>
                <div className={styles.bar}>{rows.map((row) => row.value > 0 ? <div key={row.id} className={styles.barSeg} style={{ width: `${row.currentPct}%`, background: row.color }} title={`${row.name}: ${row.currentPct.toFixed(1)}%`} /> : null)}</div>
                <div className={styles.legend}>{rows.map((row) => <span key={row.id} className={styles.legendItem}><span className={styles.dot} style={{ background: row.color }} />{row.name} · {row.currentPct.toFixed(1)}% (objetivo {row.targetPct.toFixed(1)}%)</span>)}</div>
              </section>
            )}
          </>
        ) : (
          <>
            {/* Month selector */}
            <div className={styles.monthTabs}>
              {sortedMonthKeys.map((key) => (
                <button key={key} type="button" className={`${styles.monthTab} ${key === activeMonth ? styles.monthTabActive : ""}`} onClick={() => setActiveMonth(key)}>
                  {monthLabel(key)}
                  {key === activeMonth && <span className={styles.daysLeft}> · {activeDaysRemaining} días restantes</span>}
                </button>
              ))}
              <button type="button" className={styles.newMonthBtn} onClick={newMonth}>+ Nuevo mes</button>
            </div>

            {/* Expenses */}
            <section className={styles.card}>
              <h2>Gastos</h2>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead><tr><th>Concepto</th><th>Importe</th><th>ING</th><th>Santander</th><th>Trade</th><th>Tipo</th><th>Hecho</th><th></th></tr></thead>
                  <tbody>
                    <tr className={styles.comidaRow}>
                      <td>
                        <span style={{ fontWeight: 600 }}>Comida</span>
                      </td>
                      <td className={styles.comidaInputCell}>
                        <input type="text" inputMode="decimal" value={activeData.comidaDaily} onChange={(ev) => setComidaDaily(ev.target.value)} className={styles.expenseInput} aria-label="Comida por día" style={{ width: 3.5 + "rem" }} />
                        <span className={styles.comidaUnit}>€/día</span>
                        <span className={styles.comidaCalc}>= {currency.format(activeComida)}</span>
                      </td>
                      {BANK_IDS.map((b) => (
                        <td key={b} className={`${styles.bankCell} ${activeData.comidaBank === b ? styles.bankCellActive : ""}`} onClick={() => setComidaBank(activeData.comidaBank === b ? "" : b)}>{BANK_LABELS[b]}</td>
                      ))}
                      <td>Fijo</td>
                      <td className={styles.hechoCell}>—</td>
                      <td />
                    </tr>
                    {sortedExpenses.map((e) => (
                      <tr key={e.id} className={e.paid ? styles.done : ""}>
                        <td><input type="text" value={e.name} onChange={(ev) => setExpField(e.id, "name", ev.target.value)} className={styles.expenseInput} aria-label="Nombre del gasto" /></td>
                        <td><input type="text" inputMode="decimal" value={e.amount} onChange={(ev) => { const v = ev.target.value; if (v === "" || /^\d*\.?\d*$/.test(v)) setExpField(e.id, "amount", v); }} className={styles.expenseInput} aria-label="Importe" style={{ width: 5 + "rem" }} /></td>
                        {BANK_IDS.map((b) => (
                          <td key={b} className={`${styles.bankCell} ${e.bank === b ? styles.bankCellActive : ""}`} onClick={() => setExpField(e.id, "bank", e.bank === b ? "" : b)}>{BANK_LABELS[b]}</td>
                        ))}
                        <td><select value={e.type} onChange={(ev) => setExpField(e.id, "type", ev.target.value as "fijo" | "variable")} className={styles.expenseSelect} aria-label="Tipo de gasto"><option value="fijo">Fijo</option><option value="variable">Variable</option></select></td>
                        <td className={styles.hechoCell}><input type="checkbox" checked={e.paid} onChange={(ev) => setExpField(e.id, "paid", ev.target.checked)} aria-label="Hecho" /></td>
                        <td><button type="button" className={styles.removeBtn} onClick={() => removeExpense(e.id)} aria-label={`Eliminar gasto ${e.name}`}>×</button></td>
                      </tr>
                    ))}
                    <tr className={styles.expenseAddRow}>
                      <td><input type="text" value={newExpName} onChange={(ev) => setNewExpName(ev.target.value)} placeholder="Nuevo gasto" className={styles.expenseInput} aria-label="Nombre del gasto" /></td>
                      <td><input type="text" inputMode="decimal" value={newExpAmount} onChange={(ev) => { const v = ev.target.value; if (v === "" || /^\d*\.?\d*$/.test(v)) setNewExpAmount(v); }} placeholder="0" className={styles.expenseInput} aria-label="Importe" style={{ width: 5 + "rem" }} /></td>
                      <td colSpan={3} />
                      <td><select value={newExpType} onChange={(ev) => setNewExpType(ev.target.value as "fijo" | "variable")} className={styles.expenseSelect} aria-label="Tipo de gasto"><option value="fijo">Fijo</option><option value="variable">Variable</option></select></td>
                      <td colSpan={2}><button type="button" className={styles.addBtn} onClick={addExpense}>Añadir</button></td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className={styles.expenseSummary}>
                <span>Total: {currency.format(totalExpenses)}</span>
                {activeExpenses.length > 0 && <span>Fijos: {currency.format(totalFijos)}</span>}
                {activeExpenses.length > 0 && <span>Pagados: {pagados}/{activeExpenses.length}</span>}
              </div>
            </section>

            {/* Banks */}
            <section className={styles.card}>
              <h2>Bancos</h2>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead><tr><th>Banco</th><th>Saldo</th><th>Gastos</th><th>Restante</th><th>Pendientes</th></tr></thead>
                  <tbody>
                    {BANK_IDS.map((id) => {
                      const saldo = Number.parseFloat(activeData.banks[id]) || 0;
                      const gastos = bankExpenses(id);
                      const rest = saldo - gastos;
                      const pend = bankPendientes(id);
                      return (
                        <tr key={id}>
                          <td className={styles.cellName}>{BANK_LABELS[id]}</td>
                          <td><input type="text" inputMode="decimal" value={activeData.banks[id]} onChange={(e) => setBank(id, e.target.value)} placeholder="0" className={styles.expenseInput} aria-label={`Saldo ${BANK_LABELS[id]}`} /></td>
                          <td>{currency.format(gastos)}</td>
                          <td className={rest >= 0 ? styles.inject : ""}>{currency.format(rest)}</td>
                          <td className={pend > 0 ? styles.pending : ""}>{currency.format(pend)}</td>
                        </tr>
                      );
                    })}
                    <tr className={styles.totalRow}>
                      <td>Total</td>
                      <td>{currency.format(bankTotal)}</td>
                      <td>{currency.format(totalExpenses)}</td>
                      <td className={remaining >= 0 ? styles.inject : ""}>{currency.format(remaining)}</td>
                      <td className={styles.pending}>{currency.format(totalPendientes)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        {settingsOpen && (
          <div className={styles.overlay} onClick={() => setSettingsOpen(false)} role="dialog" aria-modal="true" aria-label="Ajustes">
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
              <h2>Ajustes</h2>
              <h3>Asignación objetivo</h3>
              {assets.length === 0 ? <p className={styles.empty}>Sin activos. Añade el primero abajo.</p> : assets.map((a) => (
                <div key={a.id} className={styles.settingRow}>
                  <span className={styles.dot} style={{ background: a.color }} />
                  <span className={styles.settingName}>{a.name}</span>
                  <input type="text" inputMode="decimal" value={a.targetPct === 0 ? "" : String(a.targetPct)} onChange={(e) => changeTarget(a.id, e.target.value)} aria-label={`Objetivo de ${a.name} en porcentaje`} />
                  <span className={styles.settingPct}>%</span>
                  <button type="button" className={styles.removeBtn} onClick={() => handleRemoveAsset(a.id)} aria-label={`Eliminar ${a.name}`} title={`Eliminar ${a.name}`}>×</button>
                </div>
              ))}
              {Math.abs(targetSum - 100) > 0.01 && <p className={styles.note}>Los objetivos suman {pct.format(targetSum)}%; se ajustan a 100% automáticamente.</p>}
              <h3>Añadir activo</h3>
              <div className={styles.addRow}>
                <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nombre del activo" aria-label="Nombre del activo" />
                <input type="text" inputMode="decimal" value={newTarget} onChange={(e) => { if (e.target.value === "" || /^\d{0,3}(\.\d{0,2})?$/.test(e.target.value)) setNewTarget(e.target.value); }} placeholder="%" className={styles.addTarget} aria-label="Porcentaje objetivo" />
                <button type="button" className={styles.addBtn} onClick={handleAddAsset}>Añadir</button>
              </div>
              <div className={styles.modalFooter}>
                <div className={styles.footerLeft}><button type="button" className={styles.reset} onClick={handleReset}>Restablecer</button></div>
                <button type="button" className={styles.closeBtn} onClick={() => setSettingsOpen(false)}>Cerrar</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
