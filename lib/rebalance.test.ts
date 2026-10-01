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
    expect(p.rows.find((r) => r.id === "oro")!.toAlign).toBeCloseTo(782.83, 1);
    expect(p.rows.find((r) => r.id === "btc")!.toAlign).toBeCloseTo(287.88, 1);
    expect(p.fullNeed).toBeCloseTo(1070.71, 1);
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
    expect(p.rows.find((r) => r.id === "oro")!.allocation).toBeCloseTo(731.13, 1);
    expect(p.rows.find((r) => r.id === "btc")!.allocation).toBeCloseTo(268.87, 1);
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

  it("un activo con objetivo 0% no rompe el cálculo de los demás (sin Infinity/NaN)", () => {
    const assets = [
      ...base,
      { id: "sg", name: "Saint Gobain", targetPct: 0, color: "#ec4899" },
    ];
    const p = computePlan(assets, { msci: 88.8, oro: 30, btc: 8, sg: 6000 }, 0);
    const sg = p.rows.find((r) => r.id === "sg")!;
    expect(sg.toAlign).toBe(0);
    expect(sg.allocation).toBe(0);
    expect(Number.isFinite(p.fullNeed)).toBe(true);
    for (const r of p.rows) {
      expect(Number.isFinite(r.toAlign)).toBe(true);
    }
  });

  it("un activo con objetivo 0% no diluye el % actual de los demás", () => {
    const assets = [
      ...base,
      { id: "sg", name: "Saint Gobain", targetPct: 0, color: "#ec4899" },
    ];
    const p = computePlan(assets, { msci: 88.8, oro: 30, btc: 8, sg: 6000 }, 0);
    const msci = p.rows.find((r) => r.id === "msci")!;
    const sg = p.rows.find((r) => r.id === "sg")!;
    // 88.8 / (88.8 + 30 + 8) * 100 ≈ 70, no 88.8 / 6126.8 * 100 ≈ 1.45
    expect(msci.currentPct).toBeCloseTo(70, 0);
    expect(sg.currentPct).toBe(0);
  });
});
