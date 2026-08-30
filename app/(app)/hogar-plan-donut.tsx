"use client";

import { useState } from "react";
import { CATEGORIES, CATEGORY_LABELS, CATEGORY_COLORS, type CategoryId } from "@/lib/state";
import styles from "./hogar.module.css";

const PLAN_TOLERANCE = 5;

function planCompliant(cat: string, actualPct: number, target: number): boolean {
  if (cat === "inversion" || cat === "crecimiento") return actualPct >= target - PLAN_TOLERANCE;
  return actualPct <= target + PLAN_TOLERANCE;
}

export function PlanDonut({
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
