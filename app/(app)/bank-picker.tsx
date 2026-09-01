"use client";

import { BANK_IDS, BANK_LABELS, BANK_COLORS, type BankId } from "@/lib/state";
import styles from "./hogar.module.css";

export function BankPicker({
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
          <span
            className={`${styles.bankDot}${value === b && b === "trade" ? ` ${styles.bankDotTradeActive}` : ""}`}
            style={{ background: value === b ? BANK_COLORS[b] : "#cbd5e1" }}
          />
        </button>
      ))}
    </div>
  );
}
