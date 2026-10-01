export type AssetDef = {
  id: string;
  name: string;
  targetPct: number;
  color: string;
};

export type Row = {
  id: string;
  name: string;
  color: string;
  value: number;
  w: number;
  currentPct: number;
  targetPct: number;
  toAlign: number;
  allocation: number;
};

export type Plan = {
  rows: Row[];
  total: number;
  extra: number;
  fullNeed: number;
  targetSum: number;
  aligned: boolean;
  covered: number;
};

const max0 = (x: number) => Math.max(x, 0);

export function computePlan(
  assets: AssetDef[],
  values: Record<string, number>,
  contribution: number
): Plan {
  const total = assets.reduce((s, a) => s + (values[a.id] || 0), 0);
  const extra = contribution;
  const targetSum = assets.reduce((s, a) => s + a.targetPct, 0);
  // Un activo a objetivo 0% se sigue mostrando aparte (se ve su valor real,
  // pero no forma parte del reparto). Si contase en el total, diluiría el "% actual"
  // de los demás activos (p.ej. un activo grande sin objetivo haría que el
  // resto mostrase porcentajes ridículamente bajos). Por eso el % actual se
  // calcula sobre este "activeTotal" (solo activos con objetivo > 0), y no
  // sobre el total bruto — que sigue usándose tal cual para el importe en €.
  const activeTotal = assets.reduce(
    (s, a) => (a.targetPct > 0 ? s + (values[a.id] || 0) : s),
    0
  );

  // "Inyectar" es, para cada activo, lo que le falta hoy para estar
  // exactamente en su objetivo% del total activo DE HOY (sin anticipar que
  // el propio total crecerá con las inyecciones). Es intencionadamente el
  // cálculo simple de "aporta según el objetivo, repite la próxima vez que
  // aportes", no una búsqueda de equilibrio tras la inyección.
  const rows: Row[] = assets.map((a) => {
    const value = values[a.id] || 0;
    const w = targetSum > 0 ? a.targetPct / targetSum : 0;
    const targetValue = w * activeTotal;
    return {
      id: a.id,
      name: a.name,
      color: a.color,
      value,
      w,
      currentPct: w > 0 && activeTotal > 0 ? (value / activeTotal) * 100 : 0,
      targetPct: targetSum > 0 ? (a.targetPct / targetSum) * 100 : 0,
      toAlign: max0(targetValue - value),
      allocation: 0,
    };
  });

  const fullNeed = rows.reduce((s, r) => s + r.toAlign, 0);

  if (extra > 0) {
    if (fullNeed > 0) {
      // Reparte la aportación entre los desfasados proporcionalmente a lo
      // que le falta a cada uno; si sobra dinero una vez cubiertos todos los
      // desfases, el resto se reparte por objetivo entre todos los activos.
      const scale = Math.min(1, extra / fullNeed);
      rows.forEach((r) => {
        r.allocation = r.toAlign * scale;
      });
      const leftover = extra - fullNeed;
      if (leftover > 0) {
        rows.forEach((r) => {
          if (r.w > 0) r.allocation += r.w * leftover;
        });
      }
    } else {
      rows.forEach((r) => {
        if (r.w > 0) r.allocation = r.w * extra;
      });
    }
  }

  const tol = Math.max(0.01, total * 0.001);
  const aligned = fullNeed <= tol;
  const covered = fullNeed > 0 ? Math.min(100, Math.round((extra / fullNeed) * 100)) : 100;

  return { rows, total, extra, fullNeed, targetSum, aligned, covered };
}
