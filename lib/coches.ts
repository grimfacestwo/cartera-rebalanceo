export type Vehicle = {
  id: string;
  name: string;
  plate: string;
  year: string;
  currentKm: string;
};

export type Repair = {
  id: string;
  vehicleId: string;
  date: string;
  description: string;
  cost: string;
  km: string;
  workshop: string;
};

export type Revision = {
  id: string;
  vehicleId: string;
  title: string;
  dueDate: string;
  km: string;
  done: boolean;
};

export type CochesState = {
  vehicles: Vehicle[];
  repairs: Repair[];
  revisions: Revision[];
};

export const DEFAULT_VEHICLES: Vehicle[] = [
  { id: "opel-corsa", name: "Opel Corsa", plate: "", year: "", currentKm: "" },
  { id: "kia-carens", name: "Kia Carens", plate: "", year: "", currentKm: "" },
];

export const DEFAULT_STATE: CochesState = {
  vehicles: DEFAULT_VEHICLES,
  repairs: [],
  revisions: [],
};

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
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

export function parseCochesState(raw: unknown): CochesState {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { vehicles: [...DEFAULT_VEHICLES], repairs: [], revisions: [] };
  }
  const o = raw as Record<string, unknown>;
  const vehicles = "vehicles" in o ? parseVehicles(o.vehicles) : [...DEFAULT_VEHICLES];
  return {
    vehicles,
    repairs: parseRepairs(o.repairs),
    revisions: parseRevisions(o.revisions),
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