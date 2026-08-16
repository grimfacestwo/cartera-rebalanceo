import { describe, expect, it } from "vitest";
import {
  DEFAULT_VEHICLES,
  parseCochesState,
  parseRepairs,
  parseRevisions,
  parseVehicles,
  revisionStatus,
} from "./coches";

describe("parseCochesState", () => {
  it("devuelve los dos vehículos por defecto si no hay datos", () => {
    const state = parseCochesState(null);
    expect(state.vehicles.map((v) => v.name)).toEqual(["Opel Corsa", "Kia Carens"]);
    expect(state.repairs).toEqual([]);
    expect(state.revisions).toEqual([]);
  });

  it("siembra vehículos por defecto si falta la clave vehicles", () => {
    const state = parseCochesState({ repairs: [], revisions: [] });
    expect(state.vehicles).toEqual(DEFAULT_VEHICLES);
  });

  it("respeta vehicles vacío (el usuario los borró)", () => {
    const state = parseCochesState({ vehicles: [], repairs: [], revisions: [] });
    expect(state.vehicles).toEqual([]);
  });

  it("parsea vehículos, reparaciones y revisiones", () => {
    const state = parseCochesState({
      vehicles: [
        { id: "v1", name: "Opel Corsa", plate: "1234ABC", year: "2015", currentKm: "120000" },
      ],
      repairs: [
        { id: "r1", vehicleId: "v1", date: "2026-08-01", description: "Cambio de frenos", cost: "150", km: "119000", workshop: "Taller X" },
      ],
      revisions: [
        { id: "s1", vehicleId: "v1", title: "ITV", dueDate: "2026-12-01", km: "125000", done: false },
      ],
    });
    expect(state.vehicles[0].plate).toBe("1234ABC");
    expect(state.repairs[0].description).toBe("Cambio de frenos");
    expect(state.repairs[0].cost).toBe("150");
    expect(state.revisions[0].title).toBe("ITV");
  });
});

describe("parseVehicles", () => {
  it("filtra vehículos sin id o nombre", () => {
    const result = parseVehicles([
      { id: "v1", name: "Opel Corsa" },
      { name: "sin id" },
      { id: "v3" },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("v1");
  });

  it("rellena campos opcionales con cadena vacía", () => {
    const result = parseVehicles([{ id: "v1", name: "Kia Carens" }]);
    expect(result[0]).toEqual({ id: "v1", name: "Kia Carens", plate: "", year: "", currentKm: "" });
  });
});

describe("parseRepairs", () => {
  it("devuelve [] para datos inválidos", () => {
    expect(parseRepairs(null)).toEqual([]);
    expect(parseRepairs("mal")).toEqual([]);
  });

  it("requiere id, vehicleId y description", () => {
    const result = parseRepairs([
      { id: "r1", vehicleId: "v1", description: "ok" },
      { id: "r2", vehicleId: "v1" },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("r1");
  });
});

describe("parseRevisions", () => {
  it("parsea done=true y defaults a false", () => {
    const result = parseRevisions([
      { id: "s1", vehicleId: "v1", title: "ITV", done: true },
      { id: "s2", vehicleId: "v1", title: "Aceite" },
    ]);
    expect(result[0].done).toBe(true);
    expect(result[1].done).toBe(false);
  });
});

describe("revisionStatus", () => {
  const today = new Date("2026-08-16T12:00:00");
  const rev = (dueDate: string, done = false): Parameters<typeof revisionStatus>[0] => ({
    id: "s1",
    vehicleId: "v1",
    title: "ITV",
    dueDate,
    km: "",
    done,
  });

  it("done siempre es 'done'", () => {
    expect(revisionStatus(rev("2020-01-01", true), today)).toBe("done");
  });

  it("fecha pasada es 'overdue'", () => {
    expect(revisionStatus(rev("2026-08-01"), today)).toBe("overdue");
  });

  it("hoy o dentro de 30 días es 'soon'", () => {
    expect(revisionStatus(rev("2026-08-16"), today)).toBe("soon");
    expect(revisionStatus(rev("2026-09-15"), today)).toBe("soon");
  });

  it("más de 30 días es 'future'", () => {
    expect(revisionStatus(rev("2026-09-16"), today)).toBe("future");
    expect(revisionStatus(rev("2026-10-01"), today)).toBe("future");
  });

  it("sin fecha es 'future'", () => {
    expect(revisionStatus(rev(""), today)).toBe("future");
  });
});