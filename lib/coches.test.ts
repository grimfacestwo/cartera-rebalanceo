import { describe, expect, it } from "vitest";
import {
  CARENS_MAINTENANCE,
  CORSAS_MAINTENANCE,
  DEFAULT_VEHICLES,
  GENERIC_MAINTENANCE,
  effectiveLastKm,
  latestMatchingRepair,
  maintenanceForName,
  maintenanceKmRemaining,
  maintenanceMatchesRepair,
  maintenanceMessage,
  maintenanceMonthsRemaining,
  maintenanceStatus,
  parseCochesState,
  parseMaintenanceItems,
  parseRepairs,
  parseRevisions,
  parseVehicles,
  revisionStatus,
} from "./coches";
import type { MaintenanceItem, Repair } from "./coches";

function mkRepair(
  id: string,
  date: string,
  description: string,
  km: string,
  vehicleId = "v1"
): Repair {
  return { id, vehicleId, date, description, cost: "", km, workshop: "" };
}

function mkMaint(name: string, lastKm = ""): MaintenanceItem {
  return { id: "m1", name, intervalKm: "30000", intervalMonths: "12", lastKm, lastDate: "" };
}

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

  it("aplica el preset de mantenimiento del modelo si falta maintenance", () => {
    const result = parseVehicles([{ id: "v1", name: "Kia Carens" }]);
    expect(result[0].plate).toBe("");
    expect(result[0].maintenance).toEqual(CARENS_MAINTENANCE);
  });

  it("respeta maintenance si viene en los datos", () => {
    const result = parseVehicles([
      { id: "v1", name: "Kia Carens", maintenance: [{ id: "m1", name: "Aceite", intervalKm: "99999" }] },
    ]);
    expect(result[0].maintenance).toHaveLength(1);
    expect(result[0].maintenance[0].intervalKm).toBe("99999");
    expect(result[0].maintenance[0].intervalMonths).toBe("");
    expect(result[0].maintenance[0].lastKm).toBe("");
    expect(result[0].maintenance[0].lastDate).toBe("");
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

describe("maintenanceForName", () => {
  it("Corsa → preset diésel con aceite a 30000 km", () => {
    const items = maintenanceForName("Opel Corsa");
    expect(items).toEqual(CORSAS_MAINTENANCE);
    expect(items.find((i) => i.name === "Aceite")?.intervalKm).toBe("30000");
  });

  it("Carens → preset diésel con aceite a 15000 km", () => {
    const items = maintenanceForName("Kia Carens");
    expect(items).toEqual(CARENS_MAINTENANCE);
    expect(items.find((i) => i.name === "Aceite")?.intervalKm).toBe("15000");
    expect(items.find((i) => i.name === "Filtro de combustible")?.intervalKm).toBe("60000");
  });

  it("nombre desconocido → lista genérica", () => {
    expect(maintenanceForName("Seat León")).toEqual(GENERIC_MAINTENANCE);
  });
});

describe("parseMaintenanceItems", () => {
  it("devuelve [] para datos inválidos", () => {
    expect(parseMaintenanceItems(null)).toEqual([]);
    expect(parseMaintenanceItems("mal")).toEqual([]);
  });

  it("requiere id y name", () => {
    const result = parseMaintenanceItems([
      { id: "m1", name: "Aceite", intervalKm: "15000" },
      { name: "sin id" },
      { id: "m3" },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].intervalMonths).toBe("");
  });
});

describe("maintenanceKmRemaining", () => {
  const item = (intervalKm: string, lastKm: string): Parameters<typeof maintenanceKmRemaining>[0] => ({
    id: "m1",
    name: "Aceite",
    intervalKm,
    intervalMonths: "12",
    lastKm,
    lastDate: "",
  });

  it("calcula km restantes", () => {
    expect(maintenanceKmRemaining(item("30000", "30000"), "50000")).toBe(10000);
  });

  it("negativo si ya ha pasado el intervalo", () => {
    expect(maintenanceKmRemaining(item("30000", "10000"), "50000")).toBe(-10000);
  });

  it("null si falta el km del último cambio", () => {
    expect(maintenanceKmRemaining(item("30000", ""), "50000")).toBeNull();
  });

  it("null si falta el km actual", () => {
    expect(maintenanceKmRemaining(item("30000", "30000"), "")).toBeNull();
  });

  it("null si no hay intervalo de km", () => {
    expect(maintenanceKmRemaining(item("", "30000"), "50000")).toBeNull();
  });
});

describe("maintenanceMonthsRemaining", () => {
  const today = new Date("2026-08-16T12:00:00");
  const item = (intervalMonths: string, lastDate: string): Parameters<typeof maintenanceMonthsRemaining>[0] => ({
    id: "m1",
    name: "Líquido de frenos",
    intervalKm: "",
    intervalMonths,
    lastKm: "",
    lastDate,
  });

  it("calcula meses restantes", () => {
    expect(maintenanceMonthsRemaining(item("24", "2024-08-10"), today)).toBe(0);
    expect(maintenanceMonthsRemaining(item("24", "2024-09-10"), today)).toBe(1);
  });

  it("negativo si ya ha pasado el intervalo", () => {
    expect(maintenanceMonthsRemaining(item("24", "2023-01-10"), today)).toBe(-19);
  });

  it("null si falta la fecha del último cambio", () => {
    expect(maintenanceMonthsRemaining(item("24", ""), today)).toBeNull();
  });

  it("null si no hay intervalo de meses", () => {
    expect(maintenanceMonthsRemaining(item("", "2024-08-10"), today)).toBeNull();
  });
});

describe("maintenanceStatus", () => {
  const today = new Date("2026-08-16T12:00:00");
  const item = (intervalKm: string, lastKm: string): Parameters<typeof maintenanceStatus>[0] => ({
    id: "m1",
    name: "Aceite",
    intervalKm,
    intervalMonths: "",
    lastKm,
    lastDate: "",
  });

  it("unknown si faltan datos", () => {
    expect(maintenanceStatus(item("30000", ""), "50000", today)).toBe("unknown");
  });

  it("ok si queda margen", () => {
    expect(maintenanceStatus(item("30000", "30000"), "50000", today)).toBe("ok");
  });

  it("soon si quedan 2000 km o menos", () => {
    expect(maintenanceStatus(item("30000", "21000"), "50000", today)).toBe("soon");
    expect(maintenanceStatus(item("30000", "22000"), "50000", today)).toBe("soon");
  });

  it("overdue si ya pasó", () => {
    expect(maintenanceStatus(item("30000", "15000"), "50000", today)).toBe("overdue");
  });
});

describe("maintenanceMessage", () => {
  const item = (name: string, intervalKm: string, lastKm: string): Parameters<typeof maintenanceMessage>[0] => ({
    id: "m1",
    name,
    intervalKm,
    intervalMonths: "",
    lastKm,
    lastDate: "",
  });

  it("mensaje de km restantes", () => {
    expect(maintenanceMessage(item("Aceite", "30000", "25000"), "50000")).toBe(
      "Te faltan 5.000 km para cambiar aceite"
    );
  });

  it("mensaje de km superado", () => {
    expect(maintenanceMessage(item("Aceite", "30000", "10000"), "50000")).toBe(
      "Te has pasado 10.000 km: toca cambiar aceite"
    );
  });

  it("mensaje cuando faltan datos", () => {
    expect(maintenanceMessage(item("Aceite", "30000", ""), "50000")).toBe(
      "Fija el km o la fecha del último cambio de aceite"
    );
  });
});

describe("maintenanceMatchesRepair", () => {
  it("coincide con el nombre completo en la descripción", () => {
    expect(maintenanceMatchesRepair("Aceite", "Cambio de aceite")).toBe(true);
    expect(maintenanceMatchesRepair("Líquido de frenos", "Cambio del líquido de frenos")).toBe(true);
  });

  it("coincide por primera o última palabra", () => {
    expect(maintenanceMatchesRepair("Filtro de aceite", "Cambio aceite y filtros")).toBe(true);
    expect(maintenanceMatchesRepair("Pastillas de freno", "pastillas y discos")).toBe(true);
    expect(maintenanceMatchesRepair("Filtro de habitáculo", "cambio filtro habitaculo")).toBe(true);
  });

  it("no coincide cuando no hay relación", () => {
    expect(maintenanceMatchesRepair("Aceite", "Cambio de frenos")).toBe(false);
    expect(maintenanceMatchesRepair("Filtro de aire", "pastillas y discos")).toBe(false);
  });

  it("normaliza acentos y mayúsculas", () => {
    expect(maintenanceMatchesRepair("Habitáculo", "CAMBIO HABITACULO")).toBe(true);
  });
});

describe("latestMatchingRepair", () => {
  it("elige la reparación más reciente que coincida", () => {
    const repairs = [
      mkRepair("r1", "2026-01-10", "Cambio de aceite", "100000"),
      mkRepair("r2", "2026-05-20", "aceite y filtro", "105000"),
      mkRepair("r3", "2026-03-01", "pastillas", "102000"),
    ];
    expect(latestMatchingRepair(repairs, "v1", "Aceite")?.id).toBe("r2");
  });

  it("ignora reparaciones sin km", () => {
    const repairs = [
      mkRepair("r1", "2026-05-20", "cambio de aceite", ""),
      mkRepair("r2", "2026-01-10", "aceite", "100000"),
    ];
    expect(latestMatchingRepair(repairs, "v1", "Aceite")?.id).toBe("r2");
  });

  it("respeta el vehículo", () => {
    const repairs = [
      mkRepair("r1", "2026-05-20", "aceite", "100000", "v2"),
      mkRepair("r2", "2026-01-10", "aceite", "90000", "v1"),
    ];
    expect(latestMatchingRepair(repairs, "v1", "Aceite")?.id).toBe("r2");
  });

  it("null si no hay coincidencia", () => {
    expect(latestMatchingRepair([mkRepair("r1", "2026-01-01", "frenos", "100000")], "v1", "Aceite")).toBeNull();
  });
});

describe("effectiveLastKm", () => {
  it("usa el km de la reparación coincidente (automático)", () => {
    const repairs = [mkRepair("r1", "2026-05-20", "cambio de aceite", "105000")];
    const res = effectiveLastKm(mkMaint("Aceite", "90000"), repairs, "v1");
    expect(res.km).toBe("105000");
    expect(res.source).toBe("auto");
    expect(res.repair?.id).toBe("r1");
  });

  it("cae al manual si no hay reparación coincidente", () => {
    const repairs = [mkRepair("r1", "2026-05-20", "pastillas", "105000")];
    const res = effectiveLastKm(mkMaint("Aceite", "90000"), repairs, "v1");
    expect(res.km).toBe("90000");
    expect(res.source).toBe("manual");
  });

  it("vacío si no hay nada", () => {
    const res = effectiveLastKm(mkMaint("Aceite"), [], "v1");
    expect(res.km).toBe("");
    expect(res.source).toBe("none");
  });
});