"use client";

import { useMemo, useState } from "react";
import type { AssetDef, Row } from "@/lib/rebalance";
import type { PortfolioContribution, PortfolioValues } from "@/lib/state";
import styles from "./page.module.css";

const currency = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const pct = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 });

function formatDate(dStr: string): string {
  if (!dStr) return "—";
  const [y, m, d] = dStr.split("-").map(Number);
  if (!y || !m || !d) return dStr;
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}

export function CarteraTab({
  assets,
  values,
  contribution,
  contributions,
  setValue,
  setContribution,
  hasValues,
  tableRows,
  rows,
  total,
  extra,
  fullNeed,
  aligned,
  covered,
  onAddContribution,
  onDeleteContribution,
  onApplyRecommended,
  onQuickAddAsset,
}: {
  assets: AssetDef[];
  values: PortfolioValues;
  contribution: string;
  contributions: PortfolioContribution[];
  setValue: (id: string, v: string) => void;
  setContribution: (v: string) => void;
  hasValues: boolean;
  tableRows: Row[];
  rows: Row[];
  total: number;
  extra: number;
  fullNeed: number;
  aligned: boolean;
  covered: number;
  onAddContribution: (
    assetId: string,
    amount: string,
    date: string,
    note?: string,
    addToCurrentValue?: boolean
  ) => void;
  onDeleteContribution: (id: string, subtractFromCurrentValue?: boolean) => void;
  onApplyRecommended: () => void;
  onQuickAddAsset: (name: string, targetPct: number, initialValue: string) => void;
}) {
  // State for inline quick asset add
  const [showAddAsset, setShowAddAsset] = useState(false);
  const [newAssetName, setNewAssetName] = useState("");
  const [newAssetTarget, setNewAssetTarget] = useState("");
  const [newAssetInitialVal, setNewAssetInitialVal] = useState("");

  // State for quick contribution per asset
  const [contributingAssetId, setContributingAssetId] = useState<string | null>(null);
  const [contribAmount, setContribAmount] = useState("");
  const [contribDate, setContribDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [contribNote, setContribNote] = useState("");

  // State for manual contribution modal/form
  const [showManualContrib, setShowManualContrib] = useState(false);
  const [manualAssetId, setManualAssetId] = useState(assets[0]?.id || "");
  const [manualAmount, setManualAmount] = useState("");
  const [manualDate, setManualDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [manualNote, setManualNote] = useState("");
  const [manualAddToBalance, setManualAddToBalance] = useState(true);

  // Filter for history
  const [selectedAssetFilter, setSelectedAssetFilter] = useState<string>("all");

  // Temporary feedback toast
  const [feedback, setFeedback] = useState<string | null>(null);

  const showNotification = (msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback((cur) => (cur === msg ? null : cur)), 4000);
  };

  const handleQuickAddSubmit = () => {
    const t = Number.parseFloat(newAssetTarget);
    if (!newAssetName.trim() || !Number.isFinite(t) || t < 0 || t > 100) return;
    onQuickAddAsset(newAssetName, t, newAssetInitialVal);
    showNotification(`Activo "${newAssetName.trim()}" añadido correctamente.`);
    setNewAssetName("");
    setNewAssetTarget("");
    setNewAssetInitialVal("");
    setShowAddAsset(false);
  };

  const handleAssetContribSubmit = (assetId: string, assetName: string) => {
    const num = Number.parseFloat(contribAmount);
    if (!Number.isFinite(num) || num <= 0) return;
    onAddContribution(assetId, contribAmount, contribDate, contribNote, true);
    showNotification(`+${currency.format(num)} sumados a ${assetName} y guardados en historial.`);
    setContribAmount("");
    setContribNote("");
    setContributingAssetId(null);
  };

  const handleManualContribSubmit = () => {
    const num = Number.parseFloat(manualAmount);
    const targetAsset = assets.find((a) => a.id === manualAssetId);
    if (!Number.isFinite(num) || num <= 0 || !targetAsset) return;
    onAddContribution(manualAssetId, manualAmount, manualDate, manualNote, manualAddToBalance);
    showNotification(
      `Aportación de ${currency.format(num)} registrada para ${targetAsset.name}${
        manualAddToBalance ? " (sumada al saldo actual)" : ""
      }.`
    );
    setManualAmount("");
    setManualNote("");
    setShowManualContrib(false);
  };

  const handleDeleteWithPrompt = (c: PortfolioContribution) => {
    const asset = assets.find((a) => a.id === c.assetId);
    const assetName = asset ? asset.name : "el activo";
    const amt = Number.parseFloat(c.amount) || 0;
    const askRestar = window.confirm(
      `¿Deseas también restar ${currency.format(amt)} del saldo actual de ${assetName}?\n\n• ACEPTAR: Borrar del historial Y restar del saldo actual.\n• CANCELAR: Solo borrar del historial (mantener saldo).`
    );
    onDeleteContribution(c.id, askRestar);
    showNotification(`Aportación de ${currency.format(amt)} eliminada.`);
  };

  const handleApplyRecommendedWithFeedback = () => {
    onApplyRecommended();
    showNotification(`Aportación recomendada aplicada a tus activos y registrada en el historial.`);
  };

  // Calculations for contribution history
  const totalContributed = useMemo(() => {
    return contributions.reduce((s, c) => s + (Number.parseFloat(c.amount) || 0), 0);
  }, [contributions]);

  const filteredContributions = useMemo(() => {
    if (selectedAssetFilter === "all") return contributions;
    return contributions.filter((c) => c.assetId === selectedAssetFilter);
  }, [contributions, selectedAssetFilter]);

  const pnl = total - totalContributed;
  const pnlPct = totalContributed > 0 ? (pnl / totalContributed) * 100 : 0;

  return (
    <>
      <p className={styles.subtitle}>
        Asignación objetivo: {assets.map((a) => `${a.name} ${pct.format(a.targetPct)}%`).join(" · ")}
      </p>
      <p className={styles.subtitle}>Estrategia: nunca vendas; inyecta nuevo capital en los activos desfasados.</p>

      {feedback && (
        <div className={styles.toastFeedback} role="status">
          <span>{feedback}</span>
          <button type="button" onClick={() => setFeedback(null)} aria-label="Cerrar notificación">×</button>
        </div>
      )}

      <section className={styles.grid}>
        <div className={styles.card}>
          <div className={styles.cardHeaderWithAction}>
            <h2>Valores actuales (EUR)</h2>
            <button
              type="button"
              className={styles.secondaryActionBtn}
              onClick={() => setShowAddAsset(!showAddAsset)}
              aria-label={showAddAsset ? "Cerrar formulario de nuevo activo" : "Añadir nuevo activo"}
            >
              {showAddAsset ? "Cerrar" : "+ Añadir activo"}
            </button>
          </div>

          {/* Formulario rápido para añadir más activos */}
          {showAddAsset && (
            <div className={styles.newAssetBox}>
              <div className={styles.newAssetHeader}>
                <strong>Añadir nuevo activo a la cartera</strong>
              </div>
              <div className={styles.newAssetGrid}>
                <label>
                  <span className={styles.miniLabel}>Nombre del activo</span>
                  <input
                    type="text"
                    placeholder="Ej. S&P 500, MSCI Emergentes..."
                    value={newAssetName}
                    onChange={(e) => setNewAssetName(e.target.value)}
                    className={styles.miniInput}
                    autoFocus
                  />
                </label>
                <label>
                  <span className={styles.miniLabel}>% Objetivo</span>
                  <div className={styles.inputWithUnit}>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="10"
                      value={newAssetTarget}
                      onChange={(e) => {
                        if (e.target.value === "" || /^\d{0,3}(\.\d{0,2})?$/.test(e.target.value)) {
                          setNewAssetTarget(e.target.value);
                        }
                      }}
                      className={styles.miniInput}
                    />
                    <span className={styles.unitSuffix}>%</span>
                  </div>
                </label>
                <label>
                  <span className={styles.miniLabel}>Saldo actual (€)</span>
                  <div className={styles.inputWithUnit}>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="0"
                      value={newAssetInitialVal}
                      onChange={(e) => {
                        if (e.target.value === "" || /^\d*\.?\d*$/.test(e.target.value)) {
                          setNewAssetInitialVal(e.target.value);
                        }
                      }}
                      className={styles.miniInput}
                    />
                    <span className={styles.unitSuffix}>€</span>
                  </div>
                </label>
              </div>
              <div className={styles.inlineContribFooter}>
                <button
                  type="button"
                  className={styles.confirmContribBtn}
                  disabled={!newAssetName.trim() || !newAssetTarget}
                  onClick={handleQuickAddSubmit}
                >
                  ✓ Añadir a la cartera
                </button>
                <button
                  type="button"
                  className={styles.cancelMiniBtn}
                  onClick={() => setShowAddAsset(false)}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Lista de activos actuales */}
          {assets.map((a) => (
            <div key={a.id} className={styles.assetFieldWrap}>
              <label className={styles.field}>
                <span className={styles.fieldName}>
                  <span className={styles.dot} style={{ background: a.color }} />
                  {a.name}
                  <em>{pct.format(a.targetPct)}%</em>
                </span>
                <div className={styles.assetInputRow}>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={values[a.id] ?? ""}
                    onChange={(e) => setValue(a.id, e.target.value)}
                    aria-label={`Valor actual de ${a.name}`}
                  />
                  <button
                    type="button"
                    className={styles.quickContribBtn}
                    onClick={() => {
                      if (contributingAssetId === a.id) {
                        setContributingAssetId(null);
                      } else {
                        setContributingAssetId(a.id);
                        setContribAmount("");
                        setContribNote("");
                      }
                    }}
                    title={`Sumar aportación a ${a.name}`}
                  >
                    + Aportar €
                  </button>
                </div>
              </label>

              {/* Subformulario inline para sumar dinero directamente al activo */}
              {contributingAssetId === a.id && (
                <div className={styles.inlineContribBox}>
                  <div className={styles.inlineContribTitle}>
                    <span>Sumar dinero a <strong>{a.name}</strong></span>
                    <button
                      type="button"
                      className={styles.closeMiniBtn}
                      onClick={() => setContributingAssetId(null)}
                      aria-label="Cerrar"
                    >
                      ×
                    </button>
                  </div>
                  <div className={styles.inlineContribGrid}>
                    <div>
                      <label className={styles.miniLabel}>Importe a sumar (€)</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="Ej. 250"
                        value={contribAmount}
                        onChange={(e) => {
                          if (e.target.value === "" || /^\d*\.?\d*$/.test(e.target.value)) {
                            setContribAmount(e.target.value);
                          }
                        }}
                        autoFocus
                        className={styles.miniInput}
                      />
                    </div>
                    <div>
                      <label className={styles.miniLabel}>Fecha</label>
                      <input
                        type="date"
                        value={contribDate}
                        onChange={(e) => setContribDate(e.target.value)}
                        className={styles.miniInput}
                      />
                    </div>
                    <div>
                      <label className={styles.miniLabel}>Nota (opcional)</label>
                      <input
                        type="text"
                        placeholder="Ej. Aportación mensual"
                        value={contribNote}
                        onChange={(e) => setContribNote(e.target.value)}
                        className={styles.miniInput}
                      />
                    </div>
                  </div>
                  <div className={styles.inlineContribFooter}>
                    <button
                      type="button"
                      className={styles.confirmContribBtn}
                      disabled={!contribAmount || Number.parseFloat(contribAmount) <= 0}
                      onClick={() => handleAssetContribSubmit(a.id, a.name)}
                    >
                      ✓ Sumar {contribAmount ? `${contribAmount} €` : ""} al saldo y guardar
                    </button>
                    <button
                      type="button"
                      className={styles.cancelMiniBtn}
                      onClick={() => setContributingAssetId(null)}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {!showAddAsset && (
            <button
              type="button"
              className={styles.addAssetRowBtn}
              onClick={() => setShowAddAsset(true)}
            >
              + Añadir otro activo a la cartera
            </button>
          )}

          <label className={styles.field} style={{ marginTop: "1rem" }}>
            <span className={styles.fieldName}>
              <span className={styles.dot} style={{ background: "#22c55e" }} />
              Aportación extra (opcional)
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={contribution}
              onChange={(e) => {
                if (e.target.value === "" || /^\d*\.?\d*$/.test(e.target.value)) setContribution(e.target.value);
              }}
              placeholder="0"
              aria-label="Aportación extra"
            />
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
                              <span className={styles.dot} style={{ background: r.color }} />
                              {r.name}
                            </span>
                          </td>
                          <td>{currency.format(r.value)}</td>
                          <td>{r.currentPct.toFixed(1)}%</td>
                          <td>{isTotal ? "100%" : `${r.targetPct.toFixed(1)}%`}</td>
                          <td>
                            {isTotal ? (
                              <span className={styles.plain}>{aligned ? "—" : currency.format(r.toAlign)}</span>
                            ) : needAlign ? (
                              <span className={styles.inject}>Inyectar {currency.format(r.toAlign)}</span>
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
                              <span className={styles.inject}>{currency.format(r.allocation)}</span>
                            ) : (
                              <span className={styles.plain}>—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {aligned && extra === 0 && (
                <p className={styles.balanced}>Tu cartera ya está alineada con la asignación objetivo.</p>
              )}
              {aligned && extra > 0 && (
                <p className={styles.balanced}>Cartera alineada; la aportación se reparte según el objetivo.</p>
              )}
              {!aligned && extra === 0 && (
                <p className={styles.balanced}>
                  Necesitas inyectar {currency.format(fullNeed)} para alinear la cartera.
                </p>
              )}
              {!aligned && extra > 0 && extra >= fullNeed && (
                <p className={styles.balanced}>
                  Con tu aportación alineas la cartera
                  {extra - fullNeed > 0.5 ? ` y sobran ${currency.format(extra - fullNeed)}` : ""}.
                </p>
              )}
              {!aligned && extra > 0 && extra < fullNeed && (
                <p className={styles.balanced}>
                  Tu aportación cubre el {covered}% de lo necesario; faltan {currency.format(fullNeed - extra)}.
                </p>
              )}

              {/* Botón para aplicar aportación recomendada automáticamente */}
              {extra > 0 && rows.some((r) => r.allocation > 0.01) && (
                <div className={styles.applyAllocBox}>
                  <p className={styles.applyAllocText}>
                    ¿Deseas aplicar la aportación de <strong>{currency.format(extra)}</strong> directamente a los saldos de tus activos?
                  </p>
                  <button
                    type="button"
                    className={styles.applyAllocBtn}
                    onClick={handleApplyRecommendedWithFeedback}
                  >
                    ✓ Aplicar aportación recomendada a los saldos y registrar en historial
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* Tarjeta de Distribución */}
      {hasValues && (
        <section className={styles.card}>
          <h2>Distribución</h2>
          {(() => {
            const r = 40;
            const circ = 2 * Math.PI * r;
            let cumOffset = 0;
            const segments = rows
              .filter((row) => row.value > 0)
              .map((row) => {
                const len = (row.currentPct / 100) * circ;
                const seg = {
                  color: row.color,
                  name: row.name,
                  pct: row.currentPct,
                  targetPct: row.targetPct,
                  offset: cumOffset,
                  len,
                };
                cumOffset += len;
                return seg;
              });
            return (
              <div className={styles.pieWrap}>
                <div className={styles.pieContainer}>
                  <svg viewBox="0 0 100 100" className={styles.pie}>
                    {segments.map((s, i) => (
                      <circle
                        key={i}
                        cx="50"
                        cy="50"
                        r={r}
                        fill="none"
                        stroke={s.color}
                        strokeWidth="28"
                        strokeDasharray={`${s.len} ${circ - s.len}`}
                        strokeDashoffset={-s.offset}
                        strokeLinecap="butt"
                      />
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

      {/* Historial de aportaciones */}
      <section className={styles.card}>
        <div className={styles.cardHeaderWithAction}>
          <h2>Historial de aportaciones</h2>
          <button
            type="button"
            className={styles.secondaryActionBtn}
            onClick={() => {
              setShowManualContrib(!showManualContrib);
              if (!showManualContrib && !manualAssetId && assets.length > 0) {
                setManualAssetId(assets[0].id);
              }
            }}
          >
            {showManualContrib ? "Cerrar" : "+ Registrar aportación manual"}
          </button>
        </div>

        {/* Resumen métricas */}
        <div className={styles.historyMetrics}>
          <div className={styles.historyMetricCard}>
            <span className={styles.metricLabel}>Total aportado</span>
            <span className={styles.metricValue}>{currency.format(totalContributed)}</span>
          </div>
          <div className={styles.historyMetricCard}>
            <span className={styles.metricLabel}>Valor actual cartera</span>
            <span className={styles.metricValue}>{currency.format(total)}</span>
          </div>
          <div className={styles.historyMetricCard}>
            <span className={styles.metricLabel}>Plusvalía / Retorno</span>
            <div className={styles.metricRow}>
              <span className={styles.metricValue}>
                {pnl >= 0 ? `+${currency.format(pnl)}` : currency.format(pnl)}
              </span>
              {totalContributed > 0 && (
                <span
                  className={`${styles.metricBadge} ${
                    pnl >= 0 ? styles.metricPositive : styles.metricNegative
                  }`}
                >
                  {pnl >= 0 ? `+${pnlPct.toFixed(1)}%` : `${pnlPct.toFixed(1)}%`}
                </span>
              )}
            </div>
          </div>
          <div className={styles.historyMetricCard}>
            <span className={styles.metricLabel}>N.º de aportaciones</span>
            <span className={styles.metricValue}>{contributions.length}</span>
          </div>
        </div>

        {/* Formulario manual de aportación */}
        {showManualContrib && (
          <div className={styles.newAssetBox} style={{ marginBottom: "1.25rem" }}>
            <div className={styles.newAssetHeader}>
              <strong>Registrar nueva aportación</strong>
            </div>
            <div className={styles.manualContribGrid}>
              <label>
                <span className={styles.miniLabel}>Activo</span>
                <select
                  value={manualAssetId}
                  onChange={(e) => setManualAssetId(e.target.value)}
                  className={styles.miniInput}
                >
                  {assets.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className={styles.miniLabel}>Importe (€)</span>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={manualAmount}
                  onChange={(e) => {
                    if (e.target.value === "" || /^\d*\.?\d*$/.test(e.target.value)) {
                      setManualAmount(e.target.value);
                    }
                  }}
                  className={styles.miniInput}
                  autoFocus
                />
              </label>
              <label>
                <span className={styles.miniLabel}>Fecha</span>
                <input
                  type="date"
                  value={manualDate}
                  onChange={(e) => setManualDate(e.target.value)}
                  className={styles.miniInput}
                />
              </label>
              <label>
                <span className={styles.miniLabel}>Nota (opcional)</span>
                <input
                  type="text"
                  placeholder="Ej. Nómina extra"
                  value={manualNote}
                  onChange={(e) => setManualNote(e.target.value)}
                  className={styles.miniInput}
                />
              </label>
            </div>
            <label className={styles.checkboxRow} style={{ marginTop: "0.5rem" }}>
              <input
                type="checkbox"
                checked={manualAddToBalance}
                onChange={(e) => setManualAddToBalance(e.target.checked)}
              />
              <span>Sumar también este importe al saldo actual del activo</span>
            </label>
            <div className={styles.inlineContribFooter} style={{ marginTop: "0.75rem" }}>
              <button
                type="button"
                className={styles.confirmContribBtn}
                disabled={!manualAmount || Number.parseFloat(manualAmount) <= 0}
                onClick={handleManualContribSubmit}
              >
                ✓ Guardar aportación
              </button>
              <button
                type="button"
                className={styles.cancelMiniBtn}
                onClick={() => setShowManualContrib(false)}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Filtros por activo */}
        {assets.length > 1 && contributions.length > 0 && (
          <div className={styles.filterBar}>
            <button
              type="button"
              className={`${styles.filterPill} ${selectedAssetFilter === "all" ? styles.filterPillActive : ""}`}
              onClick={() => setSelectedAssetFilter("all")}
            >
              Todos ({contributions.length})
            </button>
            {assets.map((a) => {
              const count = contributions.filter((c) => c.assetId === a.id).length;
              return (
                <button
                  key={a.id}
                  type="button"
                  className={`${styles.filterPill} ${selectedAssetFilter === a.id ? styles.filterPillActive : ""}`}
                  onClick={() => setSelectedAssetFilter(a.id)}
                >
                  <span className={styles.dot} style={{ background: a.color, width: 8, height: 8 }} />
                  {a.name} ({count})
                </button>
              );
            })}
          </div>
        )}

        {/* Tabla de aportaciones */}
        {filteredContributions.length === 0 ? (
          <p className={styles.empty}>
            {contributions.length === 0
              ? "Aún no has registrado aportaciones. Haz clic en '+ Aportar €' junto a cualquiera de tus activos o en '+ Registrar aportación manual' para empezar."
              : "No hay aportaciones para el activo seleccionado."}
          </p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Activo</th>
                  <th>Importe</th>
                  <th>Nota</th>
                  <th style={{ textAlign: "right" }}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {filteredContributions.map((c) => {
                  const asset = assets.find((a) => a.id === c.assetId);
                  const numAmt = Number.parseFloat(c.amount) || 0;
                  return (
                    <tr key={c.id}>
                      <td style={{ whiteSpace: "nowrap" }}>{formatDate(c.date)}</td>
                      <td>
                        <span className={styles.cellName}>
                          <span
                            className={styles.dot}
                            style={{ background: asset?.color || "#94a3b8" }}
                          />
                          {asset?.name || "Activo eliminado"}
                        </span>
                      </td>
                      <td style={{ fontWeight: 600, color: "#16a34a", whiteSpace: "nowrap" }}>
                        +{currency.format(numAmt)}
                      </td>
                      <td style={{ color: c.note ? "inherit" : "#94a3b8" }}>
                        {c.note || "—"}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <button
                          type="button"
                          className={styles.removeBtn}
                          onClick={() => handleDeleteWithPrompt(c)}
                          aria-label="Eliminar aportación"
                          title="Eliminar aportación"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
