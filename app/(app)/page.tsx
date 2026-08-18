"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { computePlan, type AssetDef, type Row } from "@/lib/rebalance";
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
  PALETTE,
  addMonth,
  bankRemaining,
  categoryTotals,
  comidaAmount,
  currentMonthKey,
  daysInMonth,
  daysRemaining,
  DEFAULT_FIXED_EXPENSES,
  matchCategory,
  monthLabel,
  parseState,
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
import styles from "./page.module.css";

const currency = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const pct = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 });

type SaveStatus = "idle" | "saving" | "saved" | "error";
type TabId = "cartera" | "hogar" | "objetivos";

const EMPTY_MONTH: MonthData = { banks: { ...DEFAULT_BANKS }, expenses: [], fixed: [], comidaDaily: "40", comidaBank: "ing" };

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
  const [newExpCategory, setNewExpCategory] = useState<CategoryId>("otros");
  const [newExpRecurring, setNewExpRecurring] = useState(false);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [fixedExpenses, setFixedExpenses] = useState<FixedExpense[]>(DEFAULT_FIXED_EXPENSES);
  const [catRules, setCatRules] = useState<CategoryRule[]>([]);
  const [newCatRuleMatch, setNewCatRuleMatch] = useState("");
  const [newCatRuleCategory, setNewCatRuleCategory] = useState<CategoryId>("otros");
  const [newFixedName, setNewFixedName] = useState("");
  const [newFixedAmount, setNewFixedAmount] = useState("");
  const [newFixedCategory, setNewFixedCategory] = useState<CategoryId>("otros");
  const [expSearch, setExpSearch] = useState("");
  const [expSort, setExpSort] = useState<"paid" | "amount" | "name" | "category">("paid");
  const [expCategoryFilter, setExpCategoryFilter] = useState<CategoryId | "all">("all");
  const [expRecurringFilter, setExpRecurringFilter] = useState<"all" | "recurring" | "onetime">("all");
  const [goalName, setGoalName] = useState("");
  const [goalTarget, setGoalTarget] = useState("");
  const [goalCurrent, setGoalCurrent] = useState("");
  const [goalDeadline, setGoalDeadline] = useState("");
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
          setGoals(state.goals);
          setFixedExpenses(state.fixedExpenses);
          setCatRules(state.catRules);
          const keys = sortMonthKeys(Object.keys(state.months));
          if (keys.length > 0) setActiveMonth(keys[keys.length - 1]);
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
    const timer = setTimeout(() => {
      setSaveStatus("saving");
      fetch("/api/state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assets, values, contribution, months, goals, fixedExpenses, catRules }),
      })
        .then((res) => setSaveStatus(res.ok ? "saved" : "error"))
        .catch(() => setSaveStatus("error"));
    }, 500);
    return () => clearTimeout(timer);
  }, [assets, values, contribution, months, goals, fixedExpenses, catRules, loading, loadError]);

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

  const activeData: MonthData = useMemo(() => months[activeMonth] ?? { ...EMPTY_MONTH }, [months, activeMonth]);

  // Banks
  const setBank = (id: BankId, v: string) => {
    if (v === "" || /^\d*\.?\d*$/.test(v)) {
      updateMonth((m) => ({ ...m, banks: { ...m.banks, [id]: v } }));
    }
  };

  const allActiveExpenses = useMemo(() => [...activeData.fixed, ...activeData.expenses], [activeData]);

  const bankPendientes = (bankId: BankId) => {
    const pen = allActiveExpenses.filter((e) => e.bank === bankId && !e.paid).reduce((s, e) => s + (Number.parseFloat(e.amount) || 0), 0);
    return pen + (activeData.comidaBank === bankId ? activeComida : 0);
  };

  const bankTotal = BANK_IDS.reduce((s, id) => s + (Number.parseFloat(activeData.banks[id]) || 0), 0);
  const totalExpensesBank = allActiveExpenses.reduce((s, e) => s + (Number.parseFloat(e.amount) || 0), 0);
  const activeDaysRemaining = daysRemaining(activeMonth);
  const activeComida = comidaAmount(activeData, activeMonth);
  const totalExpenses = totalExpensesBank + activeComida;
  const totalPendientes = allActiveExpenses.filter((e) => !e.paid).reduce((s, e) => s + (Number.parseFloat(e.amount) || 0), 0) + activeComida;
  const remaining = bankTotal - totalPendientes;

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
      expenses: [...m.expenses, { id: newId(), name, amount: newExpAmount, type: newExpType, bank: "ing", paid: false, category: newExpCategory, recurring: newExpRecurring }],
    }));
    setNewExpName(""); setNewExpAmount(""); setNewExpType("variable"); setNewExpCategory("otros"); setNewExpRecurring(false);
  };

  const removeExpense = (id: string) => {
    updateMonth((m) => ({ ...m, expenses: m.expenses.filter((e) => e.id !== id) }));
  };

  const removeFixed = (id: string) => {
    updateMonth((m) => ({ ...m, fixed: m.fixed.filter((e) => e.id !== id) }));
  };

  const setFixedField = (id: string, field: keyof Expense, val: unknown) => {
    updateMonth((m) => ({
      ...m,
      fixed: m.fixed.map((e) => (e.id === id ? { ...e, [field]: val } : e)),
    }));
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
    const carriedExpenses = prev.expenses
      .filter((e) => e.recurring)
      .map((e) => ({ ...e, id: newId(), paid: false }));
    const tmpl = fixedExpenses.length > 0 ? fixedExpenses : DEFAULT_FIXED_EXPENSES;
    const seededFixed: Expense[] = tmpl.map((f) => ({ id: f.id, name: f.name, amount: f.amount, type: "fijo", bank: f.bank, paid: false, category: f.category, recurring: true }));
    setMonths((p) => {
      const prevMonth = lastKey ? p[lastKey] : undefined;
      return { ...p, [nextKey]: { banks, expenses: carriedExpenses, fixed: seededFixed, comidaDaily: prevMonth?.comidaDaily ?? "40", comidaBank: prevMonth?.comidaBank ?? "ing" } };
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
  const activeFixed = activeData.fixed;
  const totalFijos = allActiveExpenses.filter((e) => e.type === "fijo").reduce((s, e) => s + (Number.parseFloat(e.amount) || 0), 0);
  const totalRecurring = allActiveExpenses.filter((e) => e.recurring).reduce((s, e) => s + (Number.parseFloat(e.amount) || 0), 0);
  const pagados = allActiveExpenses.filter((e) => e.paid).length;
  const sortedExpenses = useMemo(() => {
    let list = [...activeExpenses];
    if (expSearch) {
      const q = expSearch.toLowerCase();
      list = list.filter((e) => e.name.toLowerCase().includes(q));
    }
    if (expCategoryFilter !== "all") {
      list = list.filter((e) => e.category === expCategoryFilter);
    }
    if (expRecurringFilter === "recurring") list = list.filter((e) => e.recurring);
    if (expRecurringFilter === "onetime") list = list.filter((e) => !e.recurring);
    switch (expSort) {
      case "amount": list.sort((a, b) => (Number.parseFloat(a.amount) || 0) - (Number.parseFloat(b.amount) || 0)); break;
      case "name": list.sort((a, b) => a.name.localeCompare(b.name, "es")); break;
      case "category": list.sort((a, b) => a.category.localeCompare(b.category)); break;
      default: list.sort((a, b) => Number(a.paid) - Number(b.paid)); break;
    }
    return list;
  }, [activeExpenses, expSearch, expSort, expCategoryFilter, expRecurringFilter]);

  // Goals helpers
  const setGoalField = (id: string, field: keyof Goal, val: string) => {
    setGoals((prev) => prev.map((g) => (g.id === id ? { ...g, [field]: val } : g)));
  };

  const addGoal = () => {
    const name = goalName.trim();
    if (!name) return;
    setGoals([...goals, { id: newId(), name, target: goalTarget, current: goalCurrent, deadline: goalDeadline }]);
    setGoalName(""); setGoalTarget(""); setGoalCurrent(""); setGoalDeadline("");
  };

  const removeGoal = (id: string) => {
    setGoals(goals.filter((g) => g.id !== id));
  };

  const goalTargetTotal = goals.reduce((s, g) => s + (Number.parseFloat(g.target) || 0), 0);
  const goalCurrentTotal = goals.reduce((s, g) => s + (Number.parseFloat(g.current) || 0), 0);

  // Category stats
  const categoryStats = useMemo(() => {
    const stats = categoryTotals(activeData);
    return Object.entries(stats)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, total]) => ({ cat: cat as CategoryId, total }));
  }, [activeData]);

  // Month-over-month comparison (includes Comida in Alimentación)
  const comidaFull = (m: MonthData | undefined, key: string) =>
    m ? (Number.parseFloat(m.comidaDaily) || 0) * daysInMonth(key) : 0;

  const comparison = useMemo(() => {
    const idx = sortedMonthKeys.indexOf(activeMonth);
    if (idx <= 0) return null;
    const prevKey = sortedMonthKeys[idx - 1];
    const cur = months[activeMonth];
    const prev = months[prevKey];
    const curTotals = categoryTotals(cur);
    curTotals.alimentacion = (curTotals.alimentacion || 0) + comidaFull(cur, activeMonth);
    const prevTotals = categoryTotals(prev);
    prevTotals.alimentacion = (prevTotals.alimentacion || 0) + comidaFull(prev, prevKey);
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
  }, [sortedMonthKeys, activeMonth, months]);

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

  // Notifications
  const [notifEnabled, setNotifEnabled] = useState(() => typeof Notification !== "undefined" && Notification.permission === "granted");
  const notifSentRef = useRef(false);

  useEffect(() => {
    if (!notifEnabled || notifSentRef.current) return;
    if (typeof Notification === "undefined") return;
    const msgs: string[] = [];
    const now = currentMonthKey();
    for (const g of goals) {
      if (g.deadline) {
        const dl = g.deadline;
        if (dl < now) {
          msgs.push(`Objetivo "${g.name}" superó su plazo (${dl})`);
        } else if (dl === now) {
          msgs.push(`Objetivo "${g.name}" vence este mes`);
        }
      }
    }
    if (remaining < 0) {
      msgs.push(`Disponible negativo: ${currency.format(remaining)}`);
    }
    if (msgs.length > 0) {
      new Notification("Cartera Rebalanceo", { body: msgs.join("\n") });
      notifSentRef.current = true;
    }
  }, [notifEnabled, goals, remaining]);

  const requestNotifications = async () => {
    if (typeof Notification === "undefined") return;
    const perm = await Notification.requestPermission();
    if (perm === "granted") {
      setNotifEnabled(true);
      notifSentRef.current = false;
    }
  };

  // Export/Import
  const handleExport = () => {
    const payload = { assets, values, contribution, months, goals, fixedExpenses, catRules };
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
          setAssets(state.assets);
          setValues(state.values);
          setContribution(state.contribution);
          setMonths(state.months);
          setGoals(state.goals);
          setFixedExpenses(state.fixedExpenses);
          setCatRules(state.catRules);
          const keys = sortMonthKeys(Object.keys(state.months));
          if (keys.length > 0) setActiveMonth(keys[keys.length - 1]);
          else setActiveMonth(currentMonthKey());
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
    setFixedExpenses((prev) => [...prev, { id: newId(), name, amount: newFixedAmount, bank: "", category: newFixedCategory }]);
    setNewFixedName(""); setNewFixedAmount("");
  };
  const removeFixedTemplate = (id: string) => {
    setFixedExpenses((prev) => prev.filter((f) => f.id !== id));
  };

  // Category rules
  const addCatRule = () => {
    const match = newCatRuleMatch.trim();
    if (!match) return;
    setCatRules((prev) => [...prev, { id: newId(), match, category: newCatRuleCategory }]);
    setNewCatRuleMatch(""); setNewCatRuleCategory("otros");
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
              {saveStatus === "saving" ? "Guardando…" : saveStatus === "saved" ? "Guardado" : "Error al guardar"}
            </p>
          )}
          {!notifEnabled && typeof Notification !== "undefined" && Notification.permission !== "denied" && (
            <button type="button" className={styles.notifBtn} onClick={requestNotifications} title="Activar notificaciones">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              Notificaciones
            </button>
          )}
        </header>

        <nav className={styles.tabs} role="tablist">
          <button type="button" role="tab" aria-selected={tab === "cartera"} className={`${styles.tab} ${tab === "cartera" ? styles.tabActive : ""}`} onClick={() => setTab("cartera")}>Cartera</button>
          <button type="button" role="tab" aria-selected={tab === "hogar"} className={`${styles.tab} ${tab === "hogar" ? styles.tabActive : ""}`} onClick={() => setTab("hogar")}>Hogar</button>
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
        ) : tab === "hogar" ? (
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
              <h2 title={
                (() => {
                  const pendAll = activeData.expenses.filter((e) => !e.paid);
                  const lines = [
                    ...pendAll.map((e) => `${e.name}: ${currency.format(Number.parseFloat(e.amount) || 0)}`),
                    ...(activeComida > 0 ? [`Comida: ${currency.format(activeComida)}`] : []),
                  ];
                  return lines.length ? `Gastos pendientes del mes:\n${lines.join("\n")}` : "Sin gastos pendientes este mes";
                })()
              }>Gastos</h2>
              {activeExpenses.length > 0 && (
                <div className={styles.filterBar}>
                  <input type="text" value={expSearch} onChange={(ev) => setExpSearch(ev.target.value)} placeholder="Buscar gasto…" className={styles.expenseInput} aria-label="Buscar gasto" style={{ maxWidth: 200 }} />
                  <select value={expCategoryFilter} onChange={(ev) => setExpCategoryFilter(ev.target.value as CategoryId | "all")} className={styles.expenseSelect} aria-label="Filtrar por categoría">
                    <option value="all">Todas las categorías</option>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                  </select>
                  <select value={expSort} onChange={(ev) => setExpSort(ev.target.value as "paid" | "amount" | "name" | "category")} className={styles.expenseSelect} aria-label="Ordenar por">
                    <option value="paid">Por estado</option>
                    <option value="amount">Por importe</option>
                    <option value="name">Por nombre</option>
                    <option value="category">Por categoría</option>
                  </select>
                  <select value={expRecurringFilter} onChange={(ev) => setExpRecurringFilter(ev.target.value as "all" | "recurring" | "onetime")} className={styles.expenseSelect} aria-label="Filtrar recurrentes">
                    <option value="all">Todos</option>
                    <option value="recurring">Recurrentes</option>
                    <option value="onetime">Puntuales</option>
                  </select>
                </div>
              )}
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead><tr><th>Concepto</th><th>Importe</th><th>Categoría</th><th>ING</th><th>Santander</th><th>Trade</th><th>Tipo</th><th>Hecho</th><th>Rec</th><th></th></tr></thead>
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
                      <td className={styles.plain}>—</td>
                      {BANK_IDS.map((b) => (
                        <td key={b} className={styles.bankCell} onClick={() => setComidaBank(activeData.comidaBank === b ? "" : b)}>
                          {activeData.comidaBank === b && <span className={styles.bankDot} style={{ background: BANK_COLORS[b] }} />}
                        </td>
                      ))}
                      <td>Fijo</td>
                      <td className={styles.hechoCell}>—</td>
                      <td />
                      <td />
                    </tr>
                    {activeFixed.length > 0 && (
                      <tr className={styles.fixedHeaderRow}>
                        <td colSpan={10}>Gastos fijos</td>
                      </tr>
                    )}
                    {activeFixed.map((e) => (
                      <tr key={e.id} className={`${styles.fixedRow} ${e.paid ? styles.done : ""}`}>
                        <td><span className={styles.fixedName}>{e.name}</span></td>
                        <td>
                          <div className={styles.amountCell}>
                            <input type="text" inputMode="decimal" value={e.amount} onChange={(ev) => { const v = ev.target.value; if (v === "" || /^\d*\.?\d*$/.test(v)) setFixedField(e.id, "amount", v); }} className={styles.expenseInput} aria-label={`Importe de ${e.name}`} style={{ width: 4 + "rem" }} />
                            <span className={styles.amountUnit}>€</span>
                          </div>
                        </td>
                        <td>
                          <select value={e.category} onChange={(ev) => setFixedField(e.id, "category", ev.target.value as CategoryId)} className={styles.expenseSelect} aria-label={`Categoría de ${e.name}`} style={{ fontSize: "0.8rem" }}>
                            {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                          </select>
                        </td>
                        {BANK_IDS.map((b) => (
                          <td key={b} className={styles.bankCell} onClick={() => setFixedField(e.id, "bank", e.bank === b ? "" : b)}>
                            {e.bank === b && <span className={styles.bankDot} style={{ background: BANK_COLORS[b] }} />}
                          </td>
                        ))}
                        <td>Fijo</td>
                        <td className={styles.hechoCell}><input type="checkbox" checked={e.paid} onChange={(ev) => setFixedField(e.id, "paid", ev.target.checked)} aria-label={`Hecho ${e.name}`} /></td>
                        <td />
                        <td><button type="button" className={styles.removeBtn} onClick={() => removeFixed(e.id)} aria-label={`Eliminar gasto fijo ${e.name}`}>×</button></td>
                      </tr>
                    ))}
                    {sortedExpenses.map((e) => (
                      <tr key={e.id} className={e.paid ? styles.done : ""}>
                        <td><input type="text" value={e.name} onChange={(ev) => setExpField(e.id, "name", ev.target.value)} className={styles.expenseInput} aria-label="Nombre del gasto" /></td>
                        <td>
                          <div className={styles.amountCell}>
                            <input type="text" inputMode="decimal" value={e.amount} onChange={(ev) => { const v = ev.target.value; if (v === "" || /^\d*\.?\d*$/.test(v)) setExpField(e.id, "amount", v); }} className={styles.expenseInput} aria-label="Importe" style={{ width: 4 + "rem" }} />
                            <span className={styles.amountUnit}>€</span>
                          </div>
                        </td>
                        <td>
                          <select value={e.category} onChange={(ev) => setExpField(e.id, "category", ev.target.value as CategoryId)} className={styles.expenseSelect} aria-label="Categoría" style={{ fontSize: "0.8rem" }}>
                            {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                          </select>
                        </td>
                        {BANK_IDS.map((b) => (
                          <td key={b} className={styles.bankCell} onClick={() => setExpField(e.id, "bank", e.bank === b ? "" : b)}>
                            {e.bank === b && <span className={styles.bankDot} style={{ background: BANK_COLORS[b] }} />}
                          </td>
                        ))}
                        <td><select value={e.type} onChange={(ev) => setExpField(e.id, "type", ev.target.value as "fijo" | "variable")} className={styles.expenseSelect} aria-label="Tipo de gasto"><option value="fijo">Fijo</option><option value="variable">Variable</option></select></td>
                        <td className={styles.hechoCell}><input type="checkbox" checked={e.paid} onChange={(ev) => setExpField(e.id, "paid", ev.target.checked)} aria-label="Hecho" /></td>
                        <td>{e.recurring && <span className={styles.recurringBadge} title="Gasto recurrente">↻</span>}</td>
                        <td><button type="button" className={styles.removeBtn} onClick={() => removeExpense(e.id)} aria-label={`Eliminar gasto ${e.name}`}>×</button></td>
                      </tr>
                    ))}
                    <tr className={styles.expenseAddRow}>
                      <td><input type="text" value={newExpName} onChange={(ev) => {
                        const v = ev.target.value;
                        setNewExpName(v);
                        const m = matchCategory(v, catRules);
                        if (m) setNewExpCategory(m);
                      }} placeholder="Nuevo gasto" className={styles.expenseInput} aria-label="Nombre del gasto" /></td>
                      <td>
                        <div className={styles.amountCell}>
                          <input type="text" inputMode="decimal" value={newExpAmount} onChange={(ev) => { const v = ev.target.value; if (v === "" || /^\d*\.?\d*$/.test(v)) setNewExpAmount(v); }} placeholder="0" className={styles.expenseInput} aria-label="Importe" style={{ width: 4 + "rem" }} />
                          <span className={styles.amountUnit}>€</span>
                        </div>
                      </td>
                      <td>
                        <select value={newExpCategory} onChange={(ev) => setNewExpCategory(ev.target.value as CategoryId)} className={styles.expenseSelect} aria-label="Categoría" style={{ fontSize: "0.8rem" }}>
                          {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                        </select>
                      </td>
                      <td colSpan={3} />
                      <td><select value={newExpType} onChange={(ev) => setNewExpType(ev.target.value as "fijo" | "variable")} className={styles.expenseSelect} aria-label="Tipo de gasto"><option value="fijo">Fijo</option><option value="variable">Variable</option></select></td>
                      <td className={styles.hechoCell}><input type="checkbox" checked={newExpRecurring} onChange={(ev) => setNewExpRecurring(ev.target.checked)} aria-label="Recurrente" title="Recurrente" /></td>
                      <td><button type="button" className={styles.addBtn} onClick={addExpense}>Añadir</button></td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className={styles.expenseSummary}>
                <span>Total: {currency.format(totalExpenses)}</span>
                {activeExpenses.length > 0 && <span>Fijos: {currency.format(totalFijos)}</span>}
                {totalRecurring > 0 && <span>Recurrencia: {currency.format(totalRecurring)}</span>}
                {activeExpenses.length > 0 && <span>Pagados: {pagados}/{activeExpenses.length}</span>}
              </div>
              {categoryStats.length > 0 && (
                <div className={styles.categoryStats}>
                  {categoryStats.map(({ cat, total }) => (
                    <span key={cat} className={styles.categoryBadge}>
                      <span className={styles.dot} style={{ background: CATEGORY_COLORS[cat] }} />
                      {CATEGORY_LABELS[cat]}: {currency.format(total)}
                    </span>
                  ))}
                </div>
              )}
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
                      const pendLines = [
                        ...pendItems.map((e) => `${e.name}: ${currency.format(Number.parseFloat(e.amount) || 0)}`),
                        ...(activeData.comidaBank === id && activeComida > 0 ? [`Comida: ${currency.format(activeComida)}`] : []),
                      ];
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
        ) : null}

        {tab === "objetivos" && !loading && !loadError && (
          <>
            <section className={styles.card}>
              <h2>Objetivos del ahorro</h2>
              {goals.length === 0 ? (
                <p className={styles.empty}>Sin objetivos. Crea el primero abajo.</p>
              ) : (
                goals.map((g) => {
                  const target = Number.parseFloat(g.target) || 0;
                  const current = Number.parseFloat(g.current) || 0;
                  const pctVal = target > 0 ? Math.min(100, (current / target) * 100) : 0;
                  const barColor = pctVal >= 100 ? "#16a34a" : current > 0 ? "#3b82f6" : "#e2e8f0";
                  return (
                    <div key={g.id} className={styles.goalRow}>
                      <div className={styles.goalFields}>
                        <input type="text" value={g.name} onChange={(e) => setGoalField(g.id, "name", e.target.value)} className={styles.goalInput} style={{ flex: 2 }} aria-label="Nombre del objetivo" />
                        <div className={styles.amountCell}>
                          <input type="text" inputMode="decimal" value={g.target} onChange={(e) => { const v = e.target.value; if (v === "" || /^\d*\.?\d*$/.test(v)) setGoalField(g.id, "target", v); }} className={styles.goalInput} placeholder="Objetivo" aria-label="Importe objetivo" style={{ flex: 1 }} />
                          <span className={styles.amountUnit}>€</span>
                        </div>
                        <div className={styles.amountCell}>
                          <input type="text" inputMode="decimal" value={g.current} onChange={(e) => { const v = e.target.value; if (v === "" || /^\d*\.?\d*$/.test(v)) setGoalField(g.id, "current", v); }} className={styles.goalInput} placeholder="Ahorrado" aria-label="Ahorrado" style={{ flex: 1 }} />
                          <span className={styles.amountUnit}>€</span>
                        </div>
                        <input type="text" value={g.deadline} onChange={(e) => setGoalField(g.id, "deadline", e.target.value)} className={styles.goalInput} placeholder="YYYY-MM" aria-label="Plazo" style={{ flex: 1 }} />
                        <button type="button" className={styles.removeBtn} onClick={() => removeGoal(g.id)} aria-label={`Eliminar objetivo ${g.name}`}>×</button>
                      </div>
                      <div className={styles.goalProgress}>
                        <div className={styles.progressBar}>
                          <div className={styles.progressFill} style={{ width: `${pctVal}%`, background: barColor }} />
                        </div>
                        <span className={styles.goalProgressText}>{currency.format(current)} / {currency.format(target)} ({pctVal.toFixed(0)}%)</span>
                      </div>
                    </div>
                  );
                })
              )}
              <div className={styles.addRow}>
                <input type="text" value={goalName} onChange={(e) => setGoalName(e.target.value)} placeholder="Nombre" className={styles.goalInput} aria-label="Nombre del objetivo" style={{ flex: 2 }} />
                <div className={styles.amountCell}>
                  <input type="text" inputMode="decimal" value={goalTarget} onChange={(e) => { const v = e.target.value; if (v === "" || /^\d*\.?\d*$/.test(v)) setGoalTarget(v); }} className={styles.goalInput} placeholder="Objetivo" aria-label="Importe objetivo" style={{ flex: 1 }} />
                  <span className={styles.amountUnit}>€</span>
                </div>
                <div className={styles.amountCell}>
                  <input type="text" inputMode="decimal" value={goalCurrent} onChange={(e) => { const v = e.target.value; if (v === "" || /^\d*\.?\d*$/.test(v)) setGoalCurrent(v); }} className={styles.goalInput} placeholder="Ahorrado" aria-label="Ahorrado" style={{ flex: 1 }} />
                  <span className={styles.amountUnit}>€</span>
                </div>
                <input type="text" value={goalDeadline} onChange={(e) => setGoalDeadline(e.target.value)} className={styles.goalInput} placeholder="YYYY-MM" aria-label="Plazo" style={{ flex: 1 }} />
                <button type="button" className={styles.addBtn} onClick={addGoal}>Añadir</button>
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
              <h3>Gastos fijos (plantilla)</h3>
              <p className={styles.note}>Estos gastos aparecen automáticamente cada mes. Edita aquí los importes y categorías por defecto; luego puedes cambiarlos mes a mes en la pestaña Hogar.</p>
              {fixedExpenses.length === 0 ? <p className={styles.empty}>Sin gastos fijos.</p> : fixedExpenses.map((f) => (
                <div key={f.id} className={styles.settingRow}>
                  <input type="text" value={f.name} onChange={(e) => setFixedTemplateField(f.id, "name", e.target.value)} aria-label={`Nombre de ${f.name}`} className={styles.settingInput} />
                  <input type="text" inputMode="decimal" value={f.amount} onChange={(e) => { const v = e.target.value; if (v === "" || /^\d*\.?\d*$/.test(v)) setFixedTemplateField(f.id, "amount", v); }} placeholder="0" aria-label={`Importe de ${f.name}`} className={styles.settingAmount} />
                  <span className={styles.settingPct}>€</span>
                  <select value={f.category} onChange={(e) => setFixedTemplateField(f.id, "category", e.target.value as CategoryId)} aria-label={`Categoría de ${f.name}`} className={styles.expenseSelect}>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                  </select>
                  <button type="button" className={styles.removeBtn} onClick={() => removeFixedTemplate(f.id)} aria-label={`Eliminar ${f.name}`} title={`Eliminar ${f.name}`}>×</button>
                </div>
              ))}
              <div className={styles.addRow}>
                <input type="text" value={newFixedName} onChange={(e) => setNewFixedName(e.target.value)} placeholder="Nuevo gasto fijo" aria-label="Nombre del gasto fijo" />
                <input type="text" inputMode="decimal" value={newFixedAmount} onChange={(e) => { const v = e.target.value; if (v === "" || /^\d*\.?\d*$/.test(v)) setNewFixedAmount(v); }} placeholder="0" aria-label="Importe" className={styles.addTarget} />
                <select value={newFixedCategory} onChange={(e) => setNewFixedCategory(e.target.value as CategoryId)} aria-label="Categoría" className={styles.expenseSelect}>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                </select>
                <button type="button" className={styles.addBtn} onClick={addFixedTemplate}>Añadir</button>
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
