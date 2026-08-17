export type Vehicle = {
  id: string;
  name: string;
  plate: string;
  year: string;
  currentKm: string;
  maintenance: MaintenanceItem[];
};

export type Repair = {
  id: string;
  vehicleId: string;
  date: string;
  description: string;
  cost: string;
  km: string;
  workshop: string;
  component: string;
};

export type Revision = {
  id: string;
  vehicleId: string;
  title: string;
  dueDate: string;
  km: string;
  done: boolean;
};

export type MaintenanceItem = {
  id: string;
  name: string;
  intervalKm: string;
  intervalMonths: string;
  lastKm: string;
  lastDate: string;
};

export type CochesState = {
  vehicles: Vehicle[];
  repairs: Repair[];
  revisions: Revision[];
  workshops: string[];
};

export const CORSAS_MAINTENANCE: MaintenanceItem[] = [
  { id: "preset-aceite", name: "Aceite", intervalKm: "30000", intervalMonths: "12", lastKm: "", lastDate: "" },
  { id: "preset-filtro-aceite", name: "Filtro de aceite", intervalKm: "30000", intervalMonths: "12", lastKm: "", lastDate: "" },
  { id: "preset-filtro-aire", name: "Filtro de aire", intervalKm: "30000", intervalMonths: "24", lastKm: "", lastDate: "" },
  { id: "preset-filtro-combustible", name: "Filtro de combustible", intervalKm: "30000", intervalMonths: "24", lastKm: "", lastDate: "" },
  { id: "preset-filtro-habitaculo", name: "Filtro de habitáculo", intervalKm: "30000", intervalMonths: "24", lastKm: "", lastDate: "" },
  { id: "preset-liquido-frenos", name: "Líquido de frenos", intervalKm: "", intervalMonths: "24", lastKm: "", lastDate: "" },
  { id: "preset-refrigerante", name: "Líquido refrigerante", intervalKm: "", intervalMonths: "60", lastKm: "", lastDate: "" },
  { id: "preset-correa-alternador", name: "Correa de alternador", intervalKm: "90000", intervalMonths: "60", lastKm: "", lastDate: "" },
  { id: "preset-pastillas", name: "Pastillas de freno", intervalKm: "45000", intervalMonths: "", lastKm: "", lastDate: "" },
];

export const CARENS_MAINTENANCE: MaintenanceItem[] = [
  { id: "preset-aceite", name: "Aceite", intervalKm: "15000", intervalMonths: "12", lastKm: "", lastDate: "" },
  { id: "preset-filtro-aceite", name: "Filtro de aceite", intervalKm: "15000", intervalMonths: "12", lastKm: "", lastDate: "" },
  { id: "preset-filtro-combustible", name: "Filtro de combustible", intervalKm: "60000", intervalMonths: "48", lastKm: "", lastDate: "" },
  { id: "preset-filtro-aire", name: "Filtro de aire", intervalKm: "30000", intervalMonths: "24", lastKm: "", lastDate: "" },
  { id: "preset-filtro-habitaculo", name: "Filtro de habitáculo", intervalKm: "15000", intervalMonths: "12", lastKm: "", lastDate: "" },
  { id: "preset-liquido-frenos", name: "Líquido de frenos", intervalKm: "", intervalMonths: "24", lastKm: "", lastDate: "" },
  { id: "preset-refrigerante", name: "Líquido refrigerante", intervalKm: "", intervalMonths: "60", lastKm: "", lastDate: "" },
  { id: "preset-correa-alternador", name: "Correa de alternador", intervalKm: "90000", intervalMonths: "60", lastKm: "", lastDate: "" },
  { id: "preset-aceite-transmision", name: "Aceite de transmisión", intervalKm: "60000", intervalMonths: "60", lastKm: "", lastDate: "" },
  { id: "preset-pastillas", name: "Pastillas de freno", intervalKm: "45000", intervalMonths: "", lastKm: "", lastDate: "" },
];

export const GENERIC_MAINTENANCE: MaintenanceItem[] = [
  { id: "preset-aceite", name: "Aceite", intervalKm: "15000", intervalMonths: "12", lastKm: "", lastDate: "" },
  { id: "preset-filtro-aceite", name: "Filtro de aceite", intervalKm: "15000", intervalMonths: "12", lastKm: "", lastDate: "" },
  { id: "preset-filtro-aire", name: "Filtro de aire", intervalKm: "30000", intervalMonths: "24", lastKm: "", lastDate: "" },
  { id: "preset-liquido-frenos", name: "Líquido de frenos", intervalKm: "", intervalMonths: "24", lastKm: "", lastDate: "" },
];

export function maintenanceForName(name: string): MaintenanceItem[] {
  const n = name.toLowerCase();
  if (n.includes("corsa")) return CORSAS_MAINTENANCE.map((i) => ({ ...i }));
  if (n.includes("carens")) return CARENS_MAINTENANCE.map((i) => ({ ...i }));
  return GENERIC_MAINTENANCE.map((i) => ({ ...i }));
}

export const DEFAULT_VEHICLES: Vehicle[] = [
  {
    id: "opel-corsa",
    name: "Opel Corsa",
    plate: "",
    year: "",
    currentKm: "",
    maintenance: CORSAS_MAINTENANCE.map((i) => ({ ...i })),
  },
  {
    id: "kia-carens",
    name: "Kia Carens",
    plate: "",
    year: "",
    currentKm: "",
    maintenance: CARENS_MAINTENANCE.map((i) => ({ ...i })),
  },
];

export const DEFAULT_STATE: CochesState = {
  vehicles: DEFAULT_VEHICLES,
  repairs: [],
  revisions: [],
  workshops: [],
};

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export function parseMaintenanceItems(raw: unknown): MaintenanceItem[] {
  if (!Array.isArray(raw)) return [];
  const out: MaintenanceItem[] = [];
  for (const item of raw) {
    if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      if (typeof o.id === "string" && typeof o.name === "string") {
        out.push({
          id: o.id,
          name: o.name,
          intervalKm: str(o.intervalKm),
          intervalMonths: str(o.intervalMonths),
          lastKm: str(o.lastKm),
          lastDate: str(o.lastDate),
        });
      }
    }
  }
  return out;
}

export function parseVehicles(raw: unknown): Vehicle[] {
  if (!Array.isArray(raw)) return [];
  const out: Vehicle[] = [];
  for (const item of raw) {
    if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      if (typeof o.id === "string" && typeof o.name === "string") {
        out.push({
          id: o.id,
          name: o.name,
          plate: str(o.plate),
          year: str(o.year),
          currentKm: str(o.currentKm),
          maintenance: "maintenance" in o ? parseMaintenanceItems(o.maintenance) : maintenanceForName(o.name),
        });
      }
    }
  }
  return out;
}

export function parseRepairs(raw: unknown): Repair[] {
  if (!Array.isArray(raw)) return [];
  const out: Repair[] = [];
  for (const item of raw) {
    if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      if (
        typeof o.id === "string" &&
        typeof o.vehicleId === "string" &&
        typeof o.description === "string"
      ) {
        out.push({
          id: o.id,
          vehicleId: o.vehicleId,
          date: str(o.date),
          description: o.description,
          cost: str(o.cost),
          km: str(o.km),
          workshop: str(o.workshop),
          component: str(o.component),
        });
      }
    }
  }
  return out;
}

export function parseRevisions(raw: unknown): Revision[] {
  if (!Array.isArray(raw)) return [];
  const out: Revision[] = [];
  for (const item of raw) {
    if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      if (typeof o.id === "string" && typeof o.vehicleId === "string") {
        out.push({
          id: o.id,
          vehicleId: o.vehicleId,
          title: str(o.title),
          dueDate: str(o.dueDate),
          km: str(o.km),
          done: o.done === true,
        });
      }
    }
  }
  return out;
}

function cloneVehicles(vs: Vehicle[]): Vehicle[] {
  return vs.map((v) => ({ ...v, maintenance: v.maintenance.map((i) => ({ ...i })) }));
}

export function parseWorkshops(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const v = str(item).trim();
    if (v && !seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

export function parseCochesState(raw: unknown): CochesState {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { vehicles: cloneVehicles(DEFAULT_VEHICLES), repairs: [], revisions: [], workshops: [] };
  }
  const o = raw as Record<string, unknown>;
  const vehicles = "vehicles" in o ? parseVehicles(o.vehicles) : cloneVehicles(DEFAULT_VEHICLES);
  return {
    vehicles,
    repairs: parseRepairs(o.repairs),
    revisions: parseRevisions(o.revisions),
    workshops: parseWorkshops(o.workshops),
  };
}

export type RevisionStatus = "done" | "overdue" | "soon" | "future";

export function revisionStatus(rev: Revision, today: Date = new Date()): RevisionStatus {
  if (rev.done) return "done";
  if (!rev.dueDate) return "future";
  const due = new Date(rev.dueDate + "T00:00:00");
  if (Number.isNaN(due.getTime())) return "future";
  const now = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const day = 24 * 60 * 60 * 1000;
  const diff = Math.round((due.getTime() - now.getTime()) / day);
  if (diff < 0) return "overdue";
  if (diff <= 30) return "soon";
  return "future";
}

export function revisionStatusLabel(s: RevisionStatus): string {
  switch (s) {
    case "done":
      return "Hecha";
    case "overdue":
      return "Vencida";
    case "soon":
      return "Próxima";
    case "future":
      return "Futura";
  }
}

// --- Mantenimiento ---

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function maintenanceMatchesRepair(name: string, description: string): boolean {
  const n = normalize(name);
  const d = normalize(description);
  if (!n || !d) return false;
  if (d.includes(n)) return true;
  const words = n.split(/\s+/);
  const first = words[0];
  const last = words[words.length - 1];
  if (first && d.includes(first)) return true;
  if (last && last !== first && d.includes(last)) return true;
  return false;
}

export function latestMatchingRepair(
  repairs: Repair[],
  vehicleId: string,
  name: string
): Repair | null {
  let best: Repair | null = null;
  for (const r of repairs) {
    if (r.vehicleId !== vehicleId) continue;
    if (!r.km) continue;
    const matchesComponent = normalize(r.component) !== "" && normalize(r.component) === normalize(name);
    if (!matchesComponent && !maintenanceMatchesRepair(name, r.description)) continue;
    if (!best || r.date > best.date) best = r;
  }
  return best;
}

export type LastKmInfo = {
  km: string;
  source: "auto" | "manual" | "none";
  repair: Repair | null;
};

export function effectiveLastKm(
  item: MaintenanceItem,
  repairs: Repair[],
  vehicleId: string
): LastKmInfo {
  const auto = latestMatchingRepair(repairs, vehicleId, item.name);
  if (auto) return { km: auto.km, source: "auto", repair: auto };
  if (item.lastKm) return { km: item.lastKm, source: "manual", repair: null };
  return { km: "", source: "none", repair: null };
}

export function maintenanceKmRemaining(item: MaintenanceItem, currentKm: string): number | null {
  const interval = Number.parseFloat(item.intervalKm);
  const cur = Number.parseFloat(currentKm);
  const last = Number.parseFloat(item.lastKm);
  if (!Number.isFinite(interval) || interval <= 0) return null;
  if (!Number.isFinite(cur)) return null;
  if (!Number.isFinite(last)) return null;
  return interval - (cur - last);
}

export function maintenanceMonthsRemaining(item: MaintenanceItem, today: Date = new Date()): number | null {
  const interval = Number.parseFloat(item.intervalMonths);
  if (!Number.isFinite(interval) || interval <= 0) return null;
  if (!item.lastDate) return null;
  const last = new Date(item.lastDate + "T00:00:00");
  if (Number.isNaN(last.getTime())) return null;
  const months =
    (today.getFullYear() - last.getFullYear()) * 12 + (today.getMonth() - last.getMonth());
  return interval - months;
}

export type MaintenanceStatus = "unknown" | "ok" | "soon" | "overdue";

function perStatus(value: number | null, threshold: number): MaintenanceStatus {
  if (value === null) return "unknown";
  if (value < 0) return "overdue";
  if (value <= threshold) return "soon";
  return "ok";
}

export function maintenanceStatus(
  item: MaintenanceItem,
  currentKm: string,
  today: Date = new Date()
): MaintenanceStatus {
  const km = perStatus(maintenanceKmRemaining(item, currentKm), 2000);
  const months = perStatus(maintenanceMonthsRemaining(item, today), 2);
  const rank: Record<MaintenanceStatus, number> = { unknown: 0, ok: 1, soon: 2, overdue: 3 };
  return rank[months] > rank[km] ? months : km;
}

function fmtKm(n: number): string {
  return Math.abs(Math.round(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function fmtMonth(n: number): string {
  const a = Math.abs(Math.round(n));
  return `${a} mes${a === 1 ? "" : "es"}`;
}

export function maintenanceMessage(
  item: MaintenanceItem,
  currentKm: string,
  today: Date = new Date()
): string {
  const km = maintenanceKmRemaining(item, currentKm);
  const months = maintenanceMonthsRemaining(item, today);
  const name = item.name.toLowerCase();

  if (km !== null && months !== null) {
    const k = km >= 0 ? `Te faltan ${fmtKm(km)} km` : `Te has pasado ${fmtKm(km)} km`;
    const mo = months >= 0 ? `y te quedan ${fmtMonth(months)}` : `y llevas ${fmtMonth(months)} de más`;
    return `${k} ${mo} para cambiar ${name}`;
  }
  if (km !== null) {
    return km >= 0
      ? `Te faltan ${fmtKm(km)} km para cambiar ${name}`
      : `Te has pasado ${fmtKm(km)} km: toca cambiar ${name}`;
  }
  if (months !== null) {
    if (months < 0) return `Te has pasado ${fmtMonth(months)}: toca cambiar ${name}`;
    if (months === 0) return `Toca cambiar ${name} este mes`;
    return `Te faltan ${fmtMonth(months)} para cambiar ${name}`;
  }
  return `Fija el km o la fecha del último cambio de ${name}`;
}