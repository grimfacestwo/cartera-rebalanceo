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
  r: number;
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

  const rows: Row[] = assets.map((a) => {
    const value = values[a.id] || 0;
    const w = targetSum > 0 ? a.targetPct / targetSum : 0;
    return {
      id: a.id,
      name: a.name,
      color: a.color,
      value,
      w,
      r: w > 0 ? value / w : Infinity,
      currentPct: total > 0 ? (value / total) * 100 : 0,
      targetPct: targetSum > 0 ? (a.targetPct / targetSum) * 100 : 0,
      toAlign: 0,
      allocation: 0,
    };
  });

  let fullTheta = 0;
  let fullNeed = 0;

  if (total > 0 && targetSum > 0) {
    const byR = [...rows].sort((a, b) => a.r - b.r);
    const n = byR.length;

    for (let k = 0; k < n; k++) {
      let sumV = 0;
      let sumW = 0;
      for (let i = k; i < n; i++) {
        sumV += byR[i].value;
        sumW += byR[i].w;
      }
      const g = sumW > 0 ? sumV / sumW : Infinity;
      const prevR = k > 0 ? byR[k - 1].r : -Infinity;
      const nextR = k < n ? byR[k].r : Infinity;
      if (prevR <= g && g <= nextR) {
        fullTheta = g;
        break;
      }
    }
    if (fullTheta === 0) fullTheta = total;

    const need = (theta: number) =>
      rows.reduce((s, r) => s + max0(r.w * theta - r.value), 0);

    fullNeed = need(fullTheta);
    rows.forEach((r) => {
      r.toAlign = max0(r.w * fullTheta - r.value);
    });

    if (extra > 0) {
      let hi = Math.max(fullTheta, extra + total, 1);
      while (need(hi) < extra) hi *= 2;
      let lo = 0;
      for (let i = 0; i < 60; i++) {
        const mid = (lo + hi) / 2;
        if (need(mid) < extra) lo = mid;
        else hi = mid;
      }
      const allocTheta = (lo + hi) / 2;
      rows.forEach((r) => {
        r.allocation = max0(r.w * allocTheta - r.value);
      });
    }
  }

  const tol = Math.max(0.01, total * 0.001);
  const aligned = fullNeed <= tol;
  const covered = fullNeed > 0 ? Math.min(100, Math.round((extra / fullNeed) * 100)) : 100;

  return { rows, total, extra, fullNeed, targetSum, aligned, covered };
}
