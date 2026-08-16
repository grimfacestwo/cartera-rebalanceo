import { describe, expect, it } from "vitest";
import { computePlan, type AssetDef } from "./rebalance";

const base: AssetDef[] = [
  { id: "msci", name: "MSCI World", targetPct: 68, color: "#3b82f6" },
  { id: "oro", name: "Oro", targetPct: 25, color: "#f59e0b" },
  { id: "btc", name: "Bitcoin", targetPct: 6, color: "#f97316" },
];

describe("computePlan", () => {
  it("nunca vende: el activo por encima del objetivo no recibe inyección", () => {
    const p = computePlan(base, { msci: 10000, oro: 2500, btc: 500 }, 0);
    expect(p.rows.find((r) => r.id === "msci")!.toAlign).toBeCloseTo(0, 1);
  });

  it("indica cuánto inyectar en los activos desfasados", () => {
    const p = computePlan(base, { msci: 10000, oro: 2500, btc: 500 }, 0);
    expect(p.rows.find((r) => r.id === "oro")!.toAlign).toBeCloseTo(1176.47, 0);
    expect(p.rows.find((r) => r.id === "btc")!.toAlign).toBeCloseTo(382.35, 0);
    expect(p.fullNeed).toBeCloseTo(1558.82, 0);
    expect(p.aligned).toBe(false);
  });

  it("no oculta activos desfasados con importes pequeños", () => {
    const p = computePlan(base, { msci: 4, oro: 0, btc: 0 }, 0);
    const oro = p.rows.find((r) => r.id === "oro")!;
    const btc = p.rows.find((r) => r.id === "btc")!;
    expect(oro.toAlign).toBeGreaterThan(0.01);
    expect(btc.toAlign).toBeGreaterThan(0.01);
    expect(p.aligned).toBe(false);
  });

  it("reparte la aportación entre los desfasados y suma el importe exacto", () => {
    const p = computePlan(base, { msci: 10000, oro: 2500, btc: 500 }, 1000);
    const allocSum = p.rows.reduce((s, r) => s + r.allocation, 0);
    expect(allocSum).toBeCloseTo(1000, 1);
    expect(p.rows.find((r) => r.id === "msci")!.allocation).toBeCloseTo(0, 1);
    expect(p.rows.find((r) => r.id === "oro")!.allocation).toBeCloseTo(725.8, 0);
    expect(p.rows.find((r) => r.id === "btc")!.allocation).toBeCloseTo(274.2, 0);
  });

  it("detecta una cartera alineada", () => {
    const p = computePlan(base, { msci: 8840, oro: 3250, btc: 780 }, 0);
    expect(p.aligned).toBe(true);
    expect(p.fullNeed).toBeCloseTo(0, 1);
  });

  it("normaliza los objetivos para que sumen 100", () => {
    const p = computePlan(base, { msci: 10000, oro: 2500, btc: 500 }, 0);
    const sum = p.rows.reduce((s, r) => s + r.targetPct, 0);
    expect(sum).toBeCloseTo(100, 1);
  });

  it("funciona con un activo añadido", () => {
    const assets = [
      ...base,
      { id: "aa", name: "Acciones A", targetPct: 10, color: "#8b5cf6" },
    ];
    const p = computePlan(assets, { msci: 10000, oro: 2500, btc: 500, aa: 0 }, 0);
    expect(p.rows).toHaveLength(4);
    expect(p.rows.find((r) => r.id === "aa")!.toAlign).toBeGreaterThan(0);
  });
});
