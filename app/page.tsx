"use client";

import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { computePlan, type AssetDef, type Row } from "@/lib/rebalance";
import styles from "./page.module.css";

const DEFAULT_ASSETS: AssetDef[] = [
  { id: "msci", name: "MSCI World", targetPct: 68, color: "#3b82f6" },
  { id: "oro", name: "Oro", targetPct: 25, color: "#f59e0b" },
  { id: "btc", name: "Bitcoin", targetPct: 6, color: "#f97316" },
];

const DEFAULT_VALUES: Record<string, string> = {
  msci: "10000",
  oro: "2500",
  btc: "500",
};

const STORAGE = {
  assets: "cartera:assets",
  values: "cartera:values",
  contribution: "cartera:contribution",
};

const PALETTE = [
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#84cc16",
  "#f43f5e",
  "#06b6d4",
  "#eab308",
  "#6366f1",
  "#d946ef",
  "#22c55e",
];

const currency = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const pct = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 });

const rawCache = new Map<string, string>();
const parsedCache = new Map<string, unknown>();

function defaultMerge<T>(fallback: T, parsed: unknown): T {
  if (typeof fallback === "object" && fallback !== null && !Array.isArray(fallback)) {
    return parsed !== null && typeof parsed === "object"
      ? { ...fallback, ...(parsed as Record<string, unknown>) }
      : fallback;
  }
  return parsed as T;
}

function mergeAssets(_fallback: AssetDef[], parsed: unknown): AssetDef[] {
  if (!Array.isArray(parsed)) return DEFAULT_ASSETS;
  const out: AssetDef[] = [];
  for (const item of parsed) {
    if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      if (typeof o.id === "string" && typeof o.name === "string") {
        out.push({
          id: o.id,
          name: o.name,
          targetPct: Number(o.targetPct) || 0,
          color: typeof o.color === "string" ? o.color : "#94a3b8",
        });
      }
    }
  }
  return out.length > 0 ? out : DEFAULT_ASSETS;
}

function readStored<T>(
  key: string,
  fallback: T,
  merge: (fb: T, parsed: unknown) => T
): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    if (rawCache.get(key) !== raw) {
      rawCache.set(key, raw);
      parsedCache.set(key, merge(fallback, JSON.parse(raw)));
    }
    return parsedCache.get(key) as T;
  } catch {
    return fallback;
  }
}

function useStored<T>(
  key: string,
  fallback: T,
  merge: (fb: T, parsed: unknown) => T = defaultMerge
): [T, (next: T) => void] {
  const listeners = useRef(new Set<() => void>());
  const subscribe = useCallback((cb: () => void) => {
    listeners.current.add(cb);
    return () => listeners.current.delete(cb);
  }, []);
  const value = useSyncExternalStore(
    subscribe,
    () => readStored(key, fallback, merge),
    () => fallback
  );
  const set = useCallback(
    (next: T) => {
      window.localStorage.setItem(key, JSON.stringify(next));
      listeners.current.forEach((l) => l());
    },
    [key]
  );
  return [value, set];
}

function nextColor(assets: AssetDef[]): string {
  const used = new Set(assets.map((a) => a.color));
  return PALETTE.find((c) => !used.has(c)) ?? `hsl(${(assets.length * 47) % 360} 70% 55%)`;
}

function newAssetId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `a${Date.now()}`;
}

export default function Home() {
  const [assets, setAssets] = useStored(STORAGE.assets, DEFAULT_ASSETS, mergeAssets);
  const [values, setValues] = useStored(STORAGE.values, DEFAULT_VALUES);
  const [contribution, setContribution] = useStored(STORAGE.contribution, "");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newTarget, setNewTarget] = useState("");

  const plan = useMemo(() => {
    const parsed = Object.fromEntries(
      assets.map((a) => [a.id, Number.parseFloat(values[a.id]) || 0])
    );
    return computePlan(assets, parsed, Number.parseFloat(contribution) || 0);
  }, [assets, values, contribution]);

  const { rows, total, extra, fullNeed, targetSum, aligned, covered } = plan;
  const hasValues = rows.some((r) => r.value > 0);

  const totalRow: Row = {
    id: "total",
    name: "Total",
    color: "#64748b",
    value: total,
    w: 1,
    r: 0,
    currentPct: 100,
    targetPct: 100,
    toAlign: fullNeed,
    allocation: extra,
  };
  const tableRows = hasValues ? [...rows, totalRow] : [];

  const setValue = (id: string, v: string) => {
    if (v === "" || /^\d*\.?\d*$/.test(v)) setValues({ ...values, [id]: v });
  };

  const changeTarget = (id: string, v: string) => {
    if (v === "" || /^\d{0,3}(\.\d{0,2})?$/.test(v)) {
      const n = Number.parseFloat(v);
      if (v === "" || (Number.isFinite(n) && n >= 0 && n <= 100)) {
        setAssets(
          assets.map((a) => (a.id === id ? { ...a, targetPct: v === "" ? 0 : n } : a))
        );
      }
    }
  };

  const handleAdd = () => {
    const name = newName.trim();
    const t = Number.parseFloat(newTarget);
    if (!name || !Number.isFinite(t) || t <= 0 || t > 100) return;
    setAssets([...assets, { id: newAssetId(), name, targetPct: t, color: nextColor(assets) }]);
    setNewName("");
    setNewTarget("");
  };

  const handleRemove = (id: string) => {
    setAssets(assets.filter((a) => a.id !== id));
    setValues(Object.fromEntries(Object.entries(values).filter(([k]) => k !== id)));
  };

  const handleReset = () => {
    if (!window.confirm("¿Restablecer todos los valores guardados?")) return;
    setAssets(DEFAULT_ASSETS);
    setValues(DEFAULT_VALUES);
    setContribution("");
  };

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <header className={styles.header}>
          <button
            type="button"
            className={styles.gear}
            onClick={() => setSettingsOpen(true)}
            aria-label="Ajustes"
            title="Ajustes"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
          <h1>Cartera Rebalanceo</h1>
          <p className={styles.subtitle}>
            Asignación objetivo:{" "}
            {assets.map((a) => `${a.name} ${pct.format(a.targetPct)}%`).join(" · ")}
          </p>
          <p className={styles.subtitle}>
            Estrategia: nunca vendas; inyecta nuevo capital en los activos desfasados.
          </p>
        </header>

        <section className={styles.grid}>
          <div className={styles.card}>
            <h2>Valores actuales (EUR)</h2>
            {assets.map((a) => (
              <label key={a.id} className={styles.field}>
                <span className={styles.fieldName}>
                  <span
                    className={styles.dot}
                    style={{ background: a.color }}
                  />
                  {a.name}
                  <em>{pct.format(a.targetPct)}%</em>
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={values[a.id] ?? ""}
                  onChange={(e) => setValue(a.id, e.target.value)}
                  aria-label={`Valor actual de ${a.name}`}
                />
              </label>
            ))}

            <label className={styles.field}>
              <span className={styles.fieldName}>
                <span className={styles.dot} style={{ background: "#22c55e" }} />
                Aportación extra (opcional)
              </span>
              <input
                type="text"
                inputMode="decimal"
                value={contribution}
                onChange={(e) => {
                  if (e.target.value === "" || /^\d*\.?\d*$/.test(e.target.value))
                    setContribution(e.target.value);
                }}
                placeholder="0"
                aria-label="Aportación extra"
              />
            </label>
          </div>

          <div className={styles.card}>
            <h2>Resultado</h2>
            {!hasValues ? (
              <p className={styles.empty}>
                Introduce el valor de cada posición para ver cuánto inyectar.
              </p>
            ) : (
              <>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Activo</th>
                      <th>Actual</th>
                      <th>% actual</th>
                      <th>Objetivo</th>
                      <th>Inyectar (alinear)</th>
                      <th>Aportación</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableRows.map((r) => {
                      const isTotal = r.id === "total";
                      const needAlign = r.toAlign > Math.max(0.01, total * 0.001);
                      const hasAlloc = extra > 0 && r.allocation > 0.01;
                      return (
                        <tr key={r.id} className={isTotal ? styles.totalRow : ""}>
                          <td>
                            <span className={styles.cellName}>
                              <span
                                className={styles.dot}
                                style={{ background: r.color }}
                              />
                              {r.name}
                            </span>
                          </td>
                          <td>{currency.format(r.value)}</td>
                          <td>{r.currentPct.toFixed(1)}%</td>
                          <td>{isTotal ? "100%" : `${r.targetPct.toFixed(1)}%`}</td>
                          <td>
                            {isTotal ? (
                              <span className={styles.plain}>
                                {aligned ? "—" : currency.format(r.toAlign)}
                              </span>
                            ) : needAlign ? (
                              <span className={styles.inject}>
                                Inyectar {currency.format(r.toAlign)}
                              </span>
                            ) : (
                              <span className={styles.plain}>—</span>
                            )}
                          </td>
                          <td>
                            {isTotal ? (
                              <span className={styles.plain}>
                                {extra > 0 ? currency.format(r.allocation) : "—"}
                              </span>
                            ) : hasAlloc ? (
                              <span className={styles.inject}>
                                {currency.format(r.allocation)}
                              </span>
                            ) : (
                              <span className={styles.plain}>—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {aligned && extra === 0 && (
                  <p className={styles.balanced}>
                    Tu cartera ya está alineada con la asignación objetivo.
                  </p>
                )}
                {aligned && extra > 0 && (
                  <p className={styles.balanced}>
                    Cartera alineada; la aportación se reparte según el objetivo.
                  </p>
                )}
                {!aligned && extra === 0 && (
                  <p className={styles.balanced}>
                    Necesitas inyectar {currency.format(fullNeed)} para alinear la cartera.
                  </p>
                )}
                {!aligned && extra > 0 && extra >= fullNeed && (
                  <p className={styles.balanced}>
                    Con tu aportación alineas la cartera
                    {extra - fullNeed > 0.5
                      ? ` y sobran ${currency.format(extra - fullNeed)}`
                      : ""}
                    .
                  </p>
                )}
                {!aligned && extra > 0 && extra < fullNeed && (
                  <p className={styles.balanced}>
                    Tu aportación cubre el {covered}% de lo necesario; faltan{" "}
                    {currency.format(fullNeed - extra)}.
                  </p>
                )}
              </>
            )}
          </div>
        </section>

        {hasValues && (
          <section className={styles.card}>
            <h2>Distribución</h2>
            <div className={styles.bar}>
              {rows.map((row) =>
                row.value > 0 ? (
                  <div
                    key={row.id}
                    className={styles.barSeg}
                    style={{
                      width: `${row.currentPct}%`,
                      background: row.color,
                    }}
                    title={`${row.name}: ${row.currentPct.toFixed(1)}%`}
                  />
                ) : null
              )}
            </div>
            <div className={styles.legend}>
              {rows.map((row) => (
                <span key={row.id} className={styles.legendItem}>
                  <span className={styles.dot} style={{ background: row.color }} />
                  {row.name} · {row.currentPct.toFixed(1)}% (objetivo{" "}
                  {row.targetPct.toFixed(1)}%)
                </span>
              ))}
            </div>
          </section>
        )}

        {settingsOpen && (
          <div
            className={styles.overlay}
            onClick={() => setSettingsOpen(false)}
            role="dialog"
            aria-modal="true"
            aria-label="Ajustes"
          >
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
              <h2>Ajustes</h2>

              <h3>Asignación objetivo</h3>
              {assets.length === 0 ? (
                <p className={styles.empty}>Sin activos. Añade el primero abajo.</p>
              ) : (
                assets.map((a) => (
                  <div key={a.id} className={styles.settingRow}>
                    <span className={styles.dot} style={{ background: a.color }} />
                    <span className={styles.settingName}>{a.name}</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={a.targetPct === 0 ? "" : String(a.targetPct)}
                      onChange={(e) => changeTarget(a.id, e.target.value)}
                      aria-label={`Objetivo de ${a.name} en porcentaje`}
                    />
                    <span className={styles.settingPct}>%</span>
                    <button
                      type="button"
                      className={styles.removeBtn}
                      onClick={() => handleRemove(a.id)}
                      aria-label={`Eliminar ${a.name}`}
                      title={`Eliminar ${a.name}`}
                    >
                      ×
                    </button>
                  </div>
                ))
              )}

              {Math.abs(targetSum - 100) > 0.01 && (
                <p className={styles.note}>
                  Los objetivos suman {pct.format(targetSum)}%; se ajustan a 100%
                  automáticamente.
                </p>
              )}

              <h3>Añadir activo</h3>
              <div className={styles.addRow}>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Nombre del activo"
                  aria-label="Nombre del activo"
                />
                <input
                  type="text"
                  inputMode="decimal"
                  value={newTarget}
                  onChange={(e) => {
                    if (e.target.value === "" || /^\d{0,3}(\.\d{0,2})?$/.test(e.target.value))
                      setNewTarget(e.target.value);
                  }}
                  placeholder="%"
                  className={styles.addTarget}
                  aria-label="Porcentaje objetivo"
                />
                <button type="button" className={styles.addBtn} onClick={handleAdd}>
                  Añadir
                </button>
              </div>

              <div className={styles.modalFooter}>
                <button type="button" className={styles.reset} onClick={handleReset}>
                  Restablecer
                </button>
                <button
                  type="button"
                  className={styles.closeBtn}
                  onClick={() => setSettingsOpen(false)}
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
