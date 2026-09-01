"use client";

import { Fragment, useEffect, useRef } from "react";
import { BANK_IDS, BANK_LABELS, type BankId, type Goal } from "@/lib/state";
import styles from "./page.module.css";

const currency = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

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

export function ObjetivosTab({
  goals,
  setGoalField,
  removeGoal,
  addGoal,
  goalName,
  setGoalName,
  goalTarget,
  setGoalTarget,
  goalCurrent,
  setGoalCurrent,
  goalBank,
  setGoalBank,
  goalRate,
  setGoalRate,
  goalTargetTotal,
  goalCurrentTotal,
  remaining,
}: {
  goals: Goal[];
  setGoalField: (id: string, field: keyof Goal, val: string) => void;
  removeGoal: (id: string) => void;
  addGoal: () => void;
  goalName: string;
  setGoalName: (v: string) => void;
  goalTarget: string;
  setGoalTarget: (v: string) => void;
  goalCurrent: string;
  setGoalCurrent: (v: string) => void;
  goalBank: BankId | "";
  setGoalBank: (v: BankId | "") => void;
  goalRate: string;
  setGoalRate: (v: string) => void;
  goalTargetTotal: number;
  goalCurrentTotal: number;
  remaining: number;
}) {
  return (
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
          Ahorrado: {currency.format(goalCurrentTotal)} / Objetivos: {currency.format(goalTargetTotal)} —
          Libre: {currency.format(remaining - goalCurrentTotal)}
        </p>
      </section>
    </>
  );
}
