"use client";

import type { AssetDef, Row } from "@/lib/rebalance";
import type { PortfolioValues } from "@/lib/state";
import styles from "./page.module.css";

const currency = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const pct = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 });

export function CarteraTab({
  assets,
  values,
  contribution,
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
}: {
  assets: AssetDef[];
  values: PortfolioValues;
  contribution: string;
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
}) {
  return (
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
  );
}
