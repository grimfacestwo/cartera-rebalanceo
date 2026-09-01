"use client";

import type { Dispatch, SetStateAction } from "react";
import type { AssetDef } from "@/lib/rebalance";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  CATEGORY_COLORS,
  type BankId,
  type CategoryId,
  type CategoryRule,
  type FixedExpense,
} from "@/lib/state";
import { BankPicker } from "./bank-picker";
import styles from "./page.module.css";

const pct = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 });

export function SettingsModal({
  assets,
  targetSum,
  planTargets,
  planSum,
  fixedExpenses,
  catRules,
  setCatRules,
  newName,
  setNewName,
  newTarget,
  setNewTarget,
  newCatRuleMatch,
  setNewCatRuleMatch,
  newCatRuleCategory,
  setNewCatRuleCategory,
  newFixedName,
  setNewFixedName,
  newFixedAmount,
  setNewFixedAmount,
  newFixedCategory,
  setNewFixedCategory,
  newFixedBank,
  setNewFixedBank,
  changeTarget,
  handleRemoveAsset,
  handleAddAsset,
  setPlanTarget,
  setFixedTemplateField,
  addFixedTemplate,
  removeFixedTemplate,
  addCatRule,
  removeCatRule,
  handleReset,
  handleExport,
  handleImport,
  onClose,
}: {
  assets: AssetDef[];
  targetSum: number;
  planTargets: Record<string, string>;
  planSum: number;
  fixedExpenses: FixedExpense[];
  catRules: CategoryRule[];
  setCatRules: Dispatch<SetStateAction<CategoryRule[]>>;
  newName: string;
  setNewName: (v: string) => void;
  newTarget: string;
  setNewTarget: (v: string) => void;
  newCatRuleMatch: string;
  setNewCatRuleMatch: (v: string) => void;
  newCatRuleCategory: CategoryId;
  setNewCatRuleCategory: (v: CategoryId) => void;
  newFixedName: string;
  setNewFixedName: (v: string) => void;
  newFixedAmount: string;
  setNewFixedAmount: (v: string) => void;
  newFixedCategory: CategoryId;
  setNewFixedCategory: (v: CategoryId) => void;
  newFixedBank: BankId | "";
  setNewFixedBank: (v: BankId | "") => void;
  changeTarget: (id: string, v: string) => void;
  handleRemoveAsset: (id: string) => void;
  handleAddAsset: () => void;
  setPlanTarget: (id: string, v: string) => void;
  setFixedTemplateField: (id: string, field: keyof FixedExpense, v: string) => void;
  addFixedTemplate: () => void;
  removeFixedTemplate: (id: string) => void;
  addCatRule: () => void;
  removeCatRule: (id: string) => void;
  handleReset: () => void;
  handleExport: () => void;
  handleImport: () => void;
  onClose: () => void;
}) {
  return (
    <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal="true" aria-label="Ajustes">
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
          <button type="button" className={styles.closeBtn} onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}
