"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { computePlan, type AssetDef, type Row } from "@/lib/rebalance";
import { putState } from "@/lib/persist";
import {
  BANK_IDS,
  BANK_LABELS,
  BANK_COLORS,
  CATEGORY_LABELS,
  CATEGORY_COLORS,
  CATEGORIES,
  DEFAULT_ASSETS,
  DEFAULT_VALUES,
  PALETTE,
  currentMonthKey,
  daysRemaining,
  effectiveAmount,
  DEFAULT_FIXED_EXPENSES,
  parseState,
  PLAN_TARGETS_DEFAULT,
  type BankId,
  type CategoryId,
  type CategoryRule,
  type FixedExpense,
  type Goal,
  type MonthData,
  type PortfolioState,
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

type SaveStatus = "idle" | "saving" | "saved" | "error" | "conflict";
type TabId = "cartera" | "objetivos";

function nextColor(assets: AssetDef[]): string {
  const used = new Set(assets.map((a) => a.color));
  return PALETTE.find((c) => !used.has(c)) ?? `hsl(${(assets.length * 47) % 360} 70% 55%)`;
}

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `n${Date.now()}`;
}

function AutoTextarea({
  value,
  onChange,
  placeholder,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  ariaLabel: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const resize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };
  useEffect(() => {
    resize();
  }, [value]);
  return (
    <textarea
      ref={ref}
      value={value}
      placeholder={placeholder}
      aria-label={ariaLabel}
      rows={1}
      className={styles.goalNotes}
      onChange={(e) => onChange(e.target.value)}
      onInput={resize}
    />
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

export default function Home() {
  const [assets, setAssets] = useState<AssetDef[]>(DEFAULT_ASSETS);
  const [values, setValues] = useState<PortfolioValues>(DEFAULT_VALUES);
  const [contribution, setContribution] = useState("");
  // months se sigue cargando/guardando aquí (sin UI propia) porque Exportar/Importar
  // necesitan el PortfolioState completo; la edición vive en /hogar.
  const [months, setMonths] = useState<Record<string, MonthData>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newTarget, setNewTarget] = useState("");
  const [tab, setTab] = useState<TabId>("cartera");
  const [goals, setGoals] = useState<Goal[]>([]);
  const [fixedExpenses, setFixedExpenses] = useState<FixedExpense[]>(DEFAULT_FIXED_EXPENSES);
  const [catRules, setCatRules] = useState<CategoryRule[]>([]);
  const [newCatRuleMatch, setNewCatRuleMatch] = useState("");
  const [newCatRuleCategory, setNewCatRuleCategory] = useState<CategoryId>("gastos");
  const [newFixedName, setNewFixedName] = useState("");
  const [newFixedAmount, setNewFixedAmount] = useState("");
  const [newFixedCategory, setNewFixedCategory] = useState<CategoryId>("gastos");
  const [planTargets, setPlanTargets] = useState<Record<string, string>>({ ...PLAN_TARGETS_DEFAULT });
  // rowOrder no tiene UI propia aquí (se edita en /hogar) pero hay que
  // cargarlo y reenviarlo tal cual al guardar — si no, cada guardado desde
  // esta página lo resetea a vacío y se pierde el orden personalizado.
  const [rowOrder, setRowOrder] = useState<string[]>([]);
  const [newFixedBank, setNewFixedBank] = useState<BankId | "">("");
  const [goalName, setGoalName] = useState("");
  const [goalTarget, setGoalTarget] = useState("");
  const [goalCurrent, setGoalCurrent] = useState("");
  const [goalBank, setGoalBank] = useState<BankId | "">("");
  const [goalRate, setGoalRate] = useState("");
  const skipOnce = useRef(true);
  const pendingStateRef = useRef<PortfolioState | null>(null);
  // Última versión conocida del estado en el servidor. Viaja en cada
  // guardado para detectar si otra pestaña/página (p.ej. /hogar) guardó de
  // por medio (ver lib/persist.ts y app/api/state/route.ts) — evita que "el
  // último que guarda gana" pise ediciones ajenas en silencio.
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
        // Alguien más guardó de por medio (p.ej. /hogar): se adopta su
        // versión en vez de sobrescribirla, y se avisa.
        applyServerState(result.state);
        lastVersionRef.current = result.version;
        setSaveStatus("conflict");
      } else {
        setSaveStatus("error");
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [assets, values, contribution, months, goals, fixedExpenses, catRules, planTargets, rowOrder, loading, loadError]);

  // Flush the último estado antes de cerrar/refrescar para no perder ediciones
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

  const planSum = CATEGORIES.reduce((s, c) => s + (Number.parseFloat(planTargets[c]) || 0), 0);

  // Goals helpers
  const setGoalField = (id: string, field: keyof Goal, val: string) => {
    setGoals((prev) => prev.map((g) => (g.id === id ? { ...g, [field]: val } : g)));
  };

  const setPlanTarget = (id: string, val: string) => {
    setPlanTargets((prev) => ({ ...prev, [id]: val }));
  };

  const addGoal = () => {
    const name = goalName.trim();
    if (!name) return;
    setGoals([...goals, { id: newId(), name, target: goalTarget, current: goalCurrent, bank: goalBank, rate: goalRate, notes: "" }]);
    setGoalName("");
    setGoalTarget("");
    setGoalCurrent("");
    setGoalBank("");
    setGoalRate("");
  };

  const removeGoal = (id: string) => {
    setGoals(goals.filter((g) => g.id !== id));
  };

  const goalTargetTotal = goals.reduce((s, g) => s + (Number.parseFloat(g.target) || 0), 0);
  const goalCurrentTotal = goals.reduce((s, g) => s + (Number.parseFloat(g.current) || 0), 0);

  // Disponible del mes actual (gestionado en /hogar) para el resumen de Objetivos.
  const curMonthKey = currentMonthKey();
  const curMonthData = months[curMonthKey];
  const remaining = curMonthData
    ? BANK_IDS.reduce((s, id) => s + (Number.parseFloat(curMonthData.banks[id]) || 0), 0) -
      [...curMonthData.fixed, ...curMonthData.expenses]
        .filter((e) => !e.paid)
        .reduce((s, e) => s + effectiveAmount(e, daysRemaining(curMonthKey)), 0)
    : 0;

  // Export/Import
  const handleExport = () => {
    const payload = { assets, values, contribution, months, goals, fixedExpenses, catRules, planTargets, rowOrder };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cartera-backup-${currentMonthKey()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result as string);
          const state = parseState(data);
          // No se reutiliza applyServerState: ese helper marca skipOnce
          // (pensado para cuando el estado ya viene sincronizado del
          // servidor) y aquí lo que se importa es justo lo que hay que
          // guardar a continuación.
          setAssets(state.assets);
          setValues(state.values);
          setContribution(state.contribution);
          setMonths(state.months);
          setGoals(state.goals);
          setFixedExpenses(state.fixedExpenses);
          setCatRules(state.catRules);
          setPlanTargets(state.planTargets);
          setRowOrder(state.rowOrder);
        } catch {
          alert("Error al importar: archivo no válido.");
        }
      };
      reader.readAsText(file);
    };
      input.click();
  };

  // Fixed expenses template
  const setFixedTemplateField = (id: string, field: keyof FixedExpense, val: string) => {
    setFixedExpenses((prev) => prev.map((f) => (f.id === id ? { ...f, [field]: val } : f)));
  };
  const addFixedTemplate = () => {
    const name = newFixedName.trim();
    if (!name) return;
    setFixedExpenses((prev) => [...prev, { id: newId(), name, amount: newFixedAmount, bank: newFixedBank, category: newFixedCategory, daily: false }]);
    setNewFixedName(""); setNewFixedAmount(""); setNewFixedBank("");
  };
  const removeFixedTemplate = (id: string) => {
    setFixedExpenses((prev) => prev.filter((f) => f.id !== id));
  };

  // Category rules
  const addCatRule = () => {
    const match = newCatRuleMatch.trim();
    if (!match) return;
    setCatRules((prev) => [...prev, { id: newId(), match, category: newCatRuleCategory }]);
    setNewCatRuleMatch(""); setNewCatRuleCategory("gastos");
  };
  const removeCatRule = (id: string) => {
    setCatRules((prev) => prev.filter((r) => r.id !== id));
  };

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
              {saveStatus === "saving"
                ? "Guardando…"
                : saveStatus === "saved"
                  ? "Guardado"
                  : saveStatus === "conflict"
                    ? "Actualizado desde otra pestaña — se descartó el cambio sin guardar"
                    : "Error al guardar"}
            </p>
          )}
        </header>

        <nav className={styles.tabs} role="tablist">
          <button type="button" role="tab" aria-selected={tab === "cartera"} className={`${styles.tab} ${tab === "cartera" ? styles.tabActive : ""}`} onClick={() => setTab("cartera")}>Cartera</button>
          <button type="button" role="tab" aria-selected={tab === "objetivos"} className={`${styles.tab} ${tab === "objetivos" ? styles.tabActive : ""}`} onClick={() => setTab("objetivos")}>Objetivos</button>
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
                {(() => {
                  const r = 40;
                  const circ = 2 * Math.PI * r;
                  let cumOffset = 0;
                  const segments = rows.filter((row) => row.value > 0).map((row) => {
                    const len = (row.currentPct / 100) * circ;
                    const seg = { color: row.color, name: row.name, pct: row.currentPct, targetPct: row.targetPct, offset: cumOffset, len };
                    cumOffset += len;
                    return seg;
                  });
                  return (
                    <div className={styles.pieWrap}>
                      <div className={styles.pieContainer}>
                        <svg viewBox="0 0 100 100" className={styles.pie}>
                          {segments.map((s, i) => (
                            <circle key={i} cx="50" cy="50" r={r} fill="none" stroke={s.color}
                              strokeWidth="28" strokeDasharray={`${s.len} ${circ - s.len}`}
                              strokeDashoffset={-s.offset} strokeLinecap="butt" />
                          ))}
                        </svg>
                        <div className={styles.pieCenter}>
                          <span className={styles.pieTotalLabel}>Total</span>
                          <span className={styles.pieTotalValue}>{currency.format(total)}</span>
                        </div>
                      </div>
                      <div className={styles.legend}>
                        {segments.map((s) => (
                          <span key={s.name} className={styles.legendItem}>
                            <span className={styles.dot} style={{ background: s.color }} />
                            {s.name} · {s.pct.toFixed(1)}% (objetivo {s.targetPct.toFixed(1)}%)
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </section>
            )}
          </>
        ) : null}

        {tab === "objetivos" && !loading && !loadError && (
          <>
            <section className={styles.card}>
              <h2>Objetivos del ahorro</h2>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Nombre</th>
                      <th>Objetivo</th>
                      <th>Ahorrado</th>
                      <th>Banco</th>
                      <th>Rentabilidad</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {goals.length === 0 ? (
                      <tr><td colSpan={6} className={styles.empty}>Sin objetivos. Crea el primero abajo.</td></tr>
                    ) : (
                      goals.map((g) => {
                        const target = Number.parseFloat(g.target) || 0;
                        const current = Number.parseFloat(g.current) || 0;
                        const pctVal = target > 0 ? Math.min(100, (current / target) * 100) : 0;
                        const barColor = pctVal >= 100 ? "#16a34a" : current > 0 ? "#3b82f6" : "#e2e8f0";
                        return (
                          <Fragment key={g.id}>
                            <tr className={styles.goalRow}>
                              <td><input type="text" value={g.name} onChange={(e) => setGoalField(g.id, "name", e.target.value)} className={styles.goalInput} aria-label="Nombre del objetivo" /></td>
                              <td><div className={styles.amountCell}><input type="text" inputMode="decimal" value={g.target} onChange={(e) => { const v = e.target.value; if (v === "" || /^\d*\.?\d*$/.test(v)) setGoalField(g.id, "target", v); }} className={styles.goalInput} placeholder="Objetivo" aria-label="Importe objetivo" /><span className={styles.amountUnit}>€</span></div></td>
                              <td><div className={styles.amountCell}><input type="text" inputMode="decimal" value={g.current} onChange={(e) => { const v = e.target.value; if (v === "" || /^\d*\.?\d*$/.test(v)) setGoalField(g.id, "current", v); }} className={styles.goalInput} placeholder="Ahorrado" aria-label="Ahorrado" /><span className={styles.amountUnit}>€</span></div></td>
                              <td>
                                <select value={g.bank} onChange={(e) => setGoalField(g.id, "bank", e.target.value)} className={`${styles.goalInput} ${styles.goalSelect}`} aria-label="Banco del objetivo">
                                  <option value="">—</option>
                                  {BANK_IDS.map((b) => (
                                    <option key={b} value={b}>{BANK_LABELS[b]}</option>
                                  ))}
                                </select>
                              </td>
                              <td><div className={styles.amountCell}><input type="text" inputMode="decimal" value={g.rate} onChange={(e) => { const v = e.target.value; if (v === "" || /^\d*\.?\d*$/.test(v)) setGoalField(g.id, "rate", v); }} className={styles.goalInput} placeholder="0" aria-label="Rentabilidad" /><span className={styles.amountUnit}>%</span></div></td>
                              <td><button type="button" className={styles.removeBtn} onClick={() => removeGoal(g.id)} aria-label={`Eliminar objetivo ${g.name}`}>×</button></td>
                            </tr>
                            <tr className={styles.goalProgressRow}>
                              <td colSpan={6}>
                                <div className={styles.goalProgress}>
                                  <div className={styles.progressBar}>
                                    <div className={styles.progressFill} style={{ width: `${pctVal}%`, background: barColor }} />
                                  </div>
                                  <span className={styles.goalProgressText}>{currency.format(current)} / {currency.format(target)} ({pctVal.toFixed(0)}%)</span>
                                </div>
                              </td>
                            </tr>
                            <tr className={styles.goalNotesRow}>
                              <td colSpan={6}>
                                <AutoTextarea
                                  value={g.notes}
                                  onChange={(v) => setGoalField(g.id, "notes", v)}
                                  placeholder="Notas…"
                                  ariaLabel={`Notas del objetivo ${g.name}`}
                                />
                              </td>
                            </tr>
                          </Fragment>
                        );
                      })
                    )}
                    <tr className={styles.goalAddRow}>
                      <td><input type="text" value={goalName} onChange={(e) => setGoalName(e.target.value)} placeholder="Nombre" className={styles.goalInput} aria-label="Nombre del objetivo" /></td>
                      <td><div className={styles.amountCell}><input type="text" inputMode="decimal" value={goalTarget} onChange={(e) => { const v = e.target.value; if (v === "" || /^\d*\.?\d*$/.test(v)) setGoalTarget(v); }} className={styles.goalInput} placeholder="Objetivo" aria-label="Importe objetivo" /><span className={styles.amountUnit}>€</span></div></td>
                      <td><div className={styles.amountCell}><input type="text" inputMode="decimal" value={goalCurrent} onChange={(e) => { const v = e.target.value; if (v === "" || /^\d*\.?\d*$/.test(v)) setGoalCurrent(v); }} className={styles.goalInput} placeholder="Ahorrado" aria-label="Ahorrado" /><span className={styles.amountUnit}>€</span></div></td>
                      <td>
                        <select value={goalBank} onChange={(e) => setGoalBank(e.target.value as BankId | "")} className={`${styles.goalInput} ${styles.goalSelect}`} aria-label="Banco del objetivo">
                          <option value="">—</option>
                          {BANK_IDS.map((b) => (
                            <option key={b} value={b}>{BANK_LABELS[b]}</option>
                          ))}
                        </select>
                      </td>
                      <td><div className={styles.amountCell}><input type="text" inputMode="decimal" value={goalRate} onChange={(e) => { const v = e.target.value; if (v === "" || /^\d*\.?\d*$/.test(v)) setGoalRate(v); }} className={styles.goalInput} placeholder="0" aria-label="Rentabilidad" /><span className={styles.amountUnit}>%</span></div></td>
                      <td><button type="button" className={styles.addBtn} onClick={addGoal}>Añadir</button></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
            <section className={styles.card}>
              <p className={`${styles.disponibleTotal} ${goalCurrentTotal >= goalTargetTotal ? styles.inject : ""}`}>
                Ahorrado: {currency.format(goalCurrentTotal)} € / Objetivos: {currency.format(goalTargetTotal)} € —
                Libre: {currency.format(remaining - goalCurrentTotal)} €
              </p>
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
              <h3>Plan de hogar</h3>
              <p className={styles.note}>Reparto objetivo del gasto mensual en 4 categorías. Se compara con el reparto real en la pestaña Hogar (donut de cumplimiento).</p>
              {CATEGORIES.map((c) => (
                <div key={c} className={styles.settingRow}>
                  <span className={styles.dot} style={{ background: CATEGORY_COLORS[c] }} />
                  <span className={styles.settingName}>{CATEGORY_LABELS[c]}</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={planTargets[c] === "" || planTargets[c] === undefined ? "" : planTargets[c]}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "" || /^\d*\.?\d*$/.test(v)) setPlanTarget(c, v);
                    }}
                    aria-label={`Objetivo de ${CATEGORY_LABELS[c]} en porcentaje`}
                  />
                  <span className={styles.settingPct}>%</span>
                </div>
              ))}
              {Math.abs(planSum - 100) > 0.01 && <p className={styles.note}>Los porcentajes suman {planSum}%; el plan ideal suma 100%.</p>}
              <h3>Gastos fijos (plantilla)</h3>
              <p className={styles.note}>Estos gastos aparecen automáticamente cada mes. Elige aquí el importe, la categoría y el banco por defecto; luego puedes ajustarlos mes a mes en la pestaña Hogar.</p>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Nombre</th>
                      <th>Importe</th>
                      <th>Categoría</th>
                      <th>Banco</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {fixedExpenses.length === 0 ? (
                      <tr><td colSpan={5} className={styles.empty}>Sin gastos fijos.</td></tr>
                    ) : (
                      fixedExpenses.map((f) => (
                        <tr key={f.id}>
                          <td><input type="text" value={f.name} onChange={(e) => setFixedTemplateField(f.id, "name", e.target.value)} aria-label={`Nombre de ${f.name}`} className={styles.settingInput} /></td>
                          <td><div className={styles.amountCell}><input type="text" inputMode="decimal" value={f.amount} onChange={(e) => { const v = e.target.value; if (v === "" || /^\d*\.?\d*$/.test(v)) setFixedTemplateField(f.id, "amount", v); }} placeholder="0" aria-label={`Importe de ${f.name}`} className={styles.settingAmount} /><span className={styles.amountUnit}>{f.daily ? "€/día" : "€"}</span></div></td>
                          <td><select value={f.category} onChange={(e) => setFixedTemplateField(f.id, "category", e.target.value as CategoryId)} aria-label={`Categoría de ${f.name}`} className={styles.expenseSelect}>
                            {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                          </select></td>
                          <td><BankPicker value={f.bank} onChange={(b) => setFixedTemplateField(f.id, "bank", b)} ariaLabel={`Banco de ${f.name}`} /></td>
                          <td><button type="button" className={styles.removeBtn} onClick={() => removeFixedTemplate(f.id)} aria-label={`Eliminar ${f.name}`} title={`Eliminar ${f.name}`}>×</button></td>
                        </tr>
                      ))
                    )}
                    <tr>
                      <td><input type="text" value={newFixedName} onChange={(e) => setNewFixedName(e.target.value)} placeholder="Nuevo gasto fijo" aria-label="Nombre del gasto fijo" /></td>
                      <td><div className={styles.amountCell}><input type="text" inputMode="decimal" value={newFixedAmount} onChange={(e) => { const v = e.target.value; if (v === "" || /^\d*\.?\d*$/.test(v)) setNewFixedAmount(v); }} placeholder="0" aria-label="Importe" className={styles.settingAmount} /><span className={styles.amountUnit}>€</span></div></td>
                      <td><select value={newFixedCategory} onChange={(e) => setNewFixedCategory(e.target.value as CategoryId)} aria-label="Categoría" className={styles.expenseSelect}>
                        {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                      </select></td>
                      <td><BankPicker value={newFixedBank} onChange={setNewFixedBank} ariaLabel="Banco del nuevo gasto fijo" /></td>
                      <td><button type="button" className={styles.addBtn} onClick={addFixedTemplate}>Añadir</button></td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <h3>Reglas de categorización</h3>
              <p className={styles.note}>Al escribir el nombre de un gasto nuevo, se asigna la categoría automáticamente si coincide con la palabra clave (sin distinguir mayúsculas).</p>
              {catRules.length === 0 ? <p className={styles.empty}>Sin reglas.</p> : catRules.map((r) => (
                <div key={r.id} className={styles.settingRow}>
                  <input type="text" value={r.match} onChange={(e) => setCatRules((prev) => prev.map((x) => x.id === r.id ? { ...x, match: e.target.value } : x))} aria-label={`Palabra clave ${r.match}`} className={styles.settingInput} />
                  <select value={r.category} onChange={(e) => setCatRules((prev) => prev.map((x) => x.id === r.id ? { ...x, category: e.target.value as CategoryId } : x))} aria-label={`Categoría de ${r.match}`} className={styles.expenseSelect}>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                  </select>
                  <button type="button" className={styles.removeBtn} onClick={() => removeCatRule(r.id)} aria-label={`Eliminar regla ${r.match}`} title={`Eliminar regla ${r.match}`}>×</button>
                </div>
              ))}
              <div className={styles.addRow}>
                <input type="text" value={newCatRuleMatch} onChange={(e) => setNewCatRuleMatch(e.target.value)} placeholder="Palabra clave (ej. netflix)" aria-label="Palabra clave" className={styles.settingInput} />
                <select value={newCatRuleCategory} onChange={(e) => setNewCatRuleCategory(e.target.value as CategoryId)} aria-label="Categoría" className={styles.expenseSelect}>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                </select>
                <button type="button" className={styles.addBtn} onClick={addCatRule}>Añadir</button>
              </div>
              <h3>Añadir activo</h3>
              <div className={styles.addRow}>
                <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nombre del activo" aria-label="Nombre del activo" />
                <input type="text" inputMode="decimal" value={newTarget} onChange={(e) => { if (e.target.value === "" || /^\d{0,3}(\.\d{0,2})?$/.test(e.target.value)) setNewTarget(e.target.value); }} placeholder="%" className={styles.addTarget} aria-label="Porcentaje objetivo" />
                <button type="button" className={styles.addBtn} onClick={handleAddAsset}>Añadir</button>
              </div>
              <div className={styles.modalFooter}>
                <div className={styles.footerLeft}>
                  <button type="button" className={styles.reset} onClick={handleReset}>Restablecer</button>
                  <button type="button" className={styles.exportBtn} onClick={handleExport}>Exportar</button>
                  <button type="button" className={styles.importBtn} onClick={handleImport}>Importar</button>
                </div>
                <button type="button" className={styles.closeBtn} onClick={() => setSettingsOpen(false)}>Cerrar</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
