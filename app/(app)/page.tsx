"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { computePlan, type AssetDef, type Row } from "@/lib/rebalance";
import { putState } from "@/lib/persist";
import {
  BANK_IDS,
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
  type PortfolioContribution,
  type PortfolioState,
  type PortfolioValues,
} from "@/lib/state";
import { CarteraTab } from "./page-cartera-tab";
import { ObjetivosTab } from "./page-objetivos-tab";
import { SettingsModal } from "./page-settings-modal";
import styles from "./page.module.css";

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
  const [contributions, setContributions] = useState<PortfolioContribution[]>([]);
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
    setContributions(state.contributions ?? []);
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
    const state: PortfolioState = { assets, values, contribution, months, goals, fixedExpenses, catRules, planTargets, rowOrder, contributions };
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
  }, [assets, values, contribution, months, goals, fixedExpenses, catRules, planTargets, rowOrder, contributions, loading, loadError]);

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
    setAssets(DEFAULT_ASSETS); setValues({ ...DEFAULT_VALUES }); setContribution(""); setContributions([]);
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
    const payload = { assets, values, contribution, months, goals, fixedExpenses, catRules, planTargets, rowOrder, contributions };
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
          setContributions(state.contributions ?? []);
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

  // Cartera contributions and quick-add handlers
  const handleAddContribution = (
    assetId: string,
    amount: string,
    date: string,
    note?: string,
    addToCurrentValue = true
  ) => {
    const num = Number.parseFloat(amount);
    if (!Number.isFinite(num) || num <= 0) return;
    if (addToCurrentValue) {
      const cur = Number.parseFloat(values[assetId]) || 0;
      const updated = (cur + num).toFixed(2).replace(/\.00$/, "");
      setValues((prev) => ({ ...prev, [assetId]: updated }));
    }
    const newEntry: PortfolioContribution = {
      id: newId(),
      assetId,
      amount: String(num),
      date: date || new Date().toISOString().slice(0, 10),
      ...(note?.trim() ? { note: note.trim() } : {}),
    };
    setContributions((prev) => [newEntry, ...prev]);
  };

  const handleDeleteContribution = (id: string, subtractFromCurrentValue = false) => {
    const item = contributions.find((c) => c.id === id);
    if (item && subtractFromCurrentValue) {
      const num = Number.parseFloat(item.amount) || 0;
      const cur = Number.parseFloat(values[item.assetId]) || 0;
      const updated = Math.max(0, cur - num).toFixed(2).replace(/\.00$/, "");
      setValues((prev) => ({ ...prev, [item.assetId]: updated }));
    }
    setContributions((prev) => prev.filter((c) => c.id !== id));
  };

  const handleApplyRecommendedContribution = () => {
    if (extra <= 0) return;
    const today = new Date().toISOString().slice(0, 10);
    const newEntries: PortfolioContribution[] = [];
    const newValues = { ...values };
    for (const r of rows) {
      if (r.allocation > 0.01) {
        const cur = Number.parseFloat(newValues[r.id]) || 0;
        newValues[r.id] = (cur + r.allocation).toFixed(2).replace(/\.00$/, "");
        newEntries.push({
          id: newId(),
          assetId: r.id,
          amount: r.allocation.toFixed(2).replace(/\.00$/, ""),
          date: today,
          note: "Aportación recomendada (rebalanceo)",
        });
      }
    }
    setValues(newValues);
    setContributions((prev) => [...newEntries, ...prev]);
    setContribution("");
  };

  const handleQuickAddAsset = (name: string, targetPct: number, initialValue: string) => {
    const trimmed = name.trim();
    if (!trimmed || !Number.isFinite(targetPct) || targetPct < 0 || targetPct > 100) return;
    const id = newId();
    const color = nextColor(assets);
    setAssets((prev) => [...prev, { id, name: trimmed, targetPct, color }]);
    const valNum = Number.parseFloat(initialValue);
    if (Number.isFinite(valNum) && valNum > 0) {
      const valStr = String(valNum);
      setValues((prev) => ({ ...prev, [id]: valStr }));
      setContributions((prev) => [
        {
          id: newId(),
          assetId: id,
          amount: valStr,
          date: new Date().toISOString().slice(0, 10),
          note: "Capital inicial",
        },
        ...prev,
      ]);
    } else {
      setValues((prev) => ({ ...prev, [id]: "0" }));
    }
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
          <CarteraTab
            assets={assets}
            values={values}
            contribution={contribution}
            contributions={contributions}
            setValue={setValue}
            setContribution={setContribution}
            hasValues={hasValues}
            tableRows={tableRows}
            rows={rows}
            total={total}
            extra={extra}
            fullNeed={fullNeed}
            aligned={aligned}
            covered={covered}
            onAddContribution={handleAddContribution}
            onDeleteContribution={handleDeleteContribution}
            onApplyRecommended={handleApplyRecommendedContribution}
            onQuickAddAsset={handleQuickAddAsset}
          />
        ) : null}

        {tab === "objetivos" && !loading && !loadError && (
          <ObjetivosTab
            goals={goals}
            setGoalField={setGoalField}
            removeGoal={removeGoal}
            addGoal={addGoal}
            goalName={goalName}
            setGoalName={setGoalName}
            goalTarget={goalTarget}
            setGoalTarget={setGoalTarget}
            goalCurrent={goalCurrent}
            setGoalCurrent={setGoalCurrent}
            goalBank={goalBank}
            setGoalBank={setGoalBank}
            goalRate={goalRate}
            setGoalRate={setGoalRate}
            goalTargetTotal={goalTargetTotal}
            goalCurrentTotal={goalCurrentTotal}
            remaining={remaining}
          />
        )}

        {settingsOpen && (
          <SettingsModal
            assets={assets}
            targetSum={targetSum}
            planTargets={planTargets}
            planSum={planSum}
            fixedExpenses={fixedExpenses}
            catRules={catRules}
            setCatRules={setCatRules}
            newName={newName}
            setNewName={setNewName}
            newTarget={newTarget}
            setNewTarget={setNewTarget}
            newCatRuleMatch={newCatRuleMatch}
            setNewCatRuleMatch={setNewCatRuleMatch}
            newCatRuleCategory={newCatRuleCategory}
            setNewCatRuleCategory={setNewCatRuleCategory}
            newFixedName={newFixedName}
            setNewFixedName={setNewFixedName}
            newFixedAmount={newFixedAmount}
            setNewFixedAmount={setNewFixedAmount}
            newFixedCategory={newFixedCategory}
            setNewFixedCategory={setNewFixedCategory}
            newFixedBank={newFixedBank}
            setNewFixedBank={setNewFixedBank}
            changeTarget={changeTarget}
            handleRemoveAsset={handleRemoveAsset}
            handleAddAsset={handleAddAsset}
            setPlanTarget={setPlanTarget}
            setFixedTemplateField={setFixedTemplateField}
            addFixedTemplate={addFixedTemplate}
            removeFixedTemplate={removeFixedTemplate}
            addCatRule={addCatRule}
            removeCatRule={removeCatRule}
            handleReset={handleReset}
            handleExport={handleExport}
            handleImport={handleImport}
            onClose={() => setSettingsOpen(false)}
          />
        )}
      </main>
    </div>
  );
}
