"use client";

import { parseMonthsSpec } from "@/lib/state";
import styles from "./hogar.module.css";

const MONTH_SHORT = ["E", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const MONTH_FULL = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export function MonthChips({
  value,
  onChange,
  ariaLabel,
}: {
  value: string;
  onChange: (spec: string) => void;
  ariaLabel: string;
}) {
  const active = parseMonthsSpec(value);
  const toggle = (num: number) => {
    const next = active.includes(num) ? active.filter((m) => m !== num) : [...active, num].sort((a, b) => a - b);
    onChange(next.join(","));
  };
  return (
    <div className={styles.monthChips} role="group" aria-label={ariaLabel}>
      {MONTH_SHORT.map((label, i) => {
        const num = i + 1;
        const isActive = active.includes(num);
        return (
          <button
            type="button"
            key={num}
            className={isActive ? styles.monthChipActive : styles.monthChip}
            onClick={() => toggle(num)}
            aria-pressed={isActive}
            title={MONTH_FULL[i]}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
