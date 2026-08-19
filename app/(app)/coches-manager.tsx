"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import c from "./coches.module.css";
import {
  type CarDocument,
  type CochesState,
  type MaintenanceItem,
  type MaintenanceStatus,
  type Repair,
  type Revision,
  type RevisionStatus,
  type Vehicle,
  effectiveLastKm,
  maintenanceForName,
  maintenanceMessage,
  maintenanceStatus,
  parseCochesState,
  repairCostByComponent,
  repairCostByWorkshop,
  repairCostByYear,
  revisionStatus,
  revisionStatusLabel,
  vehicleCostPerKm,
} from "@/lib/coches";

type SaveStatus = "idle" | "saving" | "saved" | "error";

async function saveCoches(state: CochesState, setStatus: (s: SaveStatus) => void) {
  const stripped = {
    ...state,
    documents: state.documents.map((d) => ({
      id: d.id,
      vehicleId: d.vehicleId,
      name: d.name,
      fileName: d.fileName,
      mimeType: d.mimeType,
      size: d.size,
      date: d.date,
    })),
  } as CochesState;
  const docsPayload = { docs: state.documents };

  setStatus("saving");
  let mainOk = false;
  for (let i = 0; i < 2 && !mainOk; i++) {
    try {
      const res = await fetch("/api/section/coches", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(stripped),
      });
      mainOk = res.ok;
    } catch {
      mainOk = false;
    }
  }
  let docsOk = false;
  for (let i = 0; i < 2 && !docsOk; i++) {
    try {
      const res = await fetch("/api/section/coches-docs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(docsPayload),
      });
      docsOk = res.ok;
    } catch {
      docsOk = false;
    }
  }
  setStatus(mainOk && docsOk ? "saved" : "error");
}

const STATUS_COLORS: Record<RevisionStatus, string> = {
  done: "var(--c-ok)",
  overdue: "var(--c-danger)",
  soon: "var(--c-warn)",
  future: "var(--c-muted)",
};

const MNT_STATUS_COLORS: Record<MaintenanceStatus, string> = {
  ok: "var(--c-ok)",
  overdue: "var(--c-danger)",
  soon: "var(--c-warn)",
  unknown: "var(--c-muted)",
};

const inputStyle: CSSProperties = {
  padding: "0.5rem",
  background: "var(--c-surface)",
  border: "1px solid var(--c-border)",
  borderRadius: 8,
  color: "var(--c-text)",
  fontSize: "0.85rem",
  fontFamily: "inherit",
  width: "100%",
};

const btnStyle: CSSProperties = {
  padding: "0.4rem 0.9rem",
  background: "var(--c-btn)",
  color: "var(--c-btn-text)",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: "0.85rem",
  whiteSpace: "nowrap",
  fontFamily: "inherit",
};

const btnDanger: CSSProperties = {
  ...btnStyle,
  background: "transparent",
  color: "var(--c-danger)",
};

const cardStyle: CSSProperties = {
  padding: "1.25rem 1.5rem",
  background: "var(--c-card)",
  border: "1px solid var(--c-border)",
  borderRadius: 12,
  boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
  marginBottom: "1rem",
};

const fieldGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: "0.5rem",
};

function uid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const eurFmt = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});
const eur3Fmt = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});

function fmtCost(total: number): string {
  return eurFmt.format(total);
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function CochesManager() {
  const [state, setState] = useState<CochesState | null>(null);
  const [activeId, setActiveId] = useState("");
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [newWorkshop, setNewWorkshop] = useState("");
  const [filterComponent, setFilterComponent] = useState("");
  const [filterWorkshop, setFilterWorkshop] = useState("");
  const [filterYear, setFilterYear] = useState("");
  const skipOnce = useRef(true);
  const pendingCochesRef = useRef<CochesState | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/section/coches");
        if (!res.ok) throw new Error("no data");
        const data = (await res.json()) as { data?: unknown };
        const parsed = parseCochesState(data.data);
        try {
          const docsRes = await fetch("/api/section/coches-docs");
          if (docsRes.ok) {
            const docsData = (await docsRes.json()) as { data?: { docs?: unknown } };
            const docs = Array.isArray(docsData.data?.docs) ? (docsData.data?.docs as CarDocument[]) : [];
            const byKey = new Map(docs.map((d) => [`${d.vehicleId}:${d.id}`, d]));
            parsed.documents = parsed.documents.map((doc) => {
              const full = byKey.get(`${doc.vehicleId}:${doc.id}`);
              return full ? { ...doc, data: full.data } : doc;
            });
          }
        } catch {
          /* sin documentos guardados */
        }
        if (!cancelled) {
          setState(parsed);
          setActiveId(parsed.vehicles[0]?.id ?? "");
          setLoadError(false);
        }
      } catch {
        if (!cancelled) setLoadError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  useEffect(() => {
    if (!state || loadError) return;
    if (skipOnce.current) {
      skipOnce.current = false;
      return;
    }
    pendingCochesRef.current = state;
    const timer = setTimeout(() => {
      void saveCoches(state, setSaveStatus);
    }, 500);
    return () => clearTimeout(timer);
  }, [state, loadError]);

  useEffect(() => {
    const flush = () => {
      const s = pendingCochesRef.current;
      if (!s) return;
      try {
        const stripped = {
          ...s,
          documents: s.documents.map((d) => ({
            id: d.id,
            vehicleId: d.vehicleId,
            name: d.name,
            fileName: d.fileName,
            mimeType: d.mimeType,
            size: d.size,
            date: d.date,
          })),
        } as CochesState;
        fetch("/api/section/coches", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(stripped),
          keepalive: true,
        });
      } catch {
        /* ignore */
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const retry = () => {
    setLoadError(false);
    setState(null);
    setReloadKey((k) => k + 1);
  };

  if (loadError) {
    return (
      <div className={c.page}>
        <p style={{ color: "var(--c-muted)" }}>No se pudo cargar el contenido.</p>
        <button type="button" onClick={retry} style={btnStyle}>
          Reintentar
        </button>
      </div>
    );
  }

  if (!state) {
    return (
      <div className={c.page}>
        <p style={{ color: "var(--c-muted)" }}>Cargando…</p>
      </div>
    );
  }

  const active = state.vehicles.find((v) => v.id === activeId) ?? null;
  const repairs = active
    ? state.repairs
        .filter((r) => r.vehicleId === active.id)
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    : [];
  const filteredRepairs = repairs.filter(
    (r) =>
      (!filterComponent || r.component === filterComponent) &&
      (!filterWorkshop || r.workshop === filterWorkshop) &&
      (!filterYear || r.date.slice(0, 4) === filterYear)
  );
  const totalCost = filteredRepairs.reduce((s, r) => s + (Number.parseFloat(r.cost) || 0), 0);
  const usedComponents = Array.from(new Set(repairs.map((r) => r.component).filter(Boolean))).sort();
  const usedWorkshops = Array.from(new Set(repairs.map((r) => r.workshop).filter(Boolean))).sort();
  const usedYears = Array.from(new Set(repairs.map((r) => r.date.slice(0, 4)).filter(Boolean))).sort().reverse();
  const hasRepairFilters = filterComponent !== "" || filterWorkshop !== "" || filterYear !== "";
  const activeDocs = active
    ? state.documents.filter((d) => d.vehicleId === active.id).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    : [];
  const yearStats = repairCostByYear(state.repairs, activeId);
  const componentStats = repairCostByComponent(state.repairs, activeId);
  const workshopStats = repairCostByWorkshop(state.repairs, activeId);
  const perKm = vehicleCostPerKm(state.repairs, activeId, active?.currentKm ?? "");
  const revisions = active
    ? state.revisions
        .filter((r) => r.vehicleId === active.id)
        .sort((a, b) => {
          if (!a.dueDate) return 1;
          if (!b.dueDate) return -1;
          return a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0;
        })
    : [];
  const pendingCount = revisions.filter((r) => !r.done).length;
  const componentOptions = active
    ? Array.from(new Set(active.maintenance.map((m) => m.name.trim()).filter(Boolean)))
    : [];

  const updateVehicle = (id: string, patch: Partial<Vehicle>) =>
    setState((s) =>
      s ? { ...s, vehicles: s.vehicles.map((v) => (v.id === id ? { ...v, ...patch } : v)) } : s
    );

  const addRepair = () => {
    if (!active) return;
    const repair: Repair = {
      id: uid(),
      vehicleId: active.id,
      date: new Date().toISOString().slice(0, 10),
      description: "",
      cost: "",
      km: "",
      workshop: "",
      component: "",
    };
    setState((s) => (s ? { ...s, repairs: [...s.repairs, repair] } : s));
  };

  const updateRepair = (id: string, patch: Partial<Repair>) =>
    setState((s) =>
      s ? { ...s, repairs: s.repairs.map((r) => (r.id === id ? { ...r, ...patch } : r)) } : s
    );

  const deleteRepair = (id: string) =>
    setState((s) => (s ? { ...s, repairs: s.repairs.filter((r) => r.id !== id) } : s));

  const addWorkshop = () => {
    const name = newWorkshop.trim();
    if (!name) return;
    setState((s) =>
      s && !s.workshops.includes(name) ? { ...s, workshops: [...s.workshops, name] } : s
    );
    setNewWorkshop("");
  };

  const deleteWorkshop = (name: string) =>
    setState((s) => (s ? { ...s, workshops: s.workshops.filter((w) => w !== name) } : s));

  const addDocument = (file: File) => {
    const MAX_SIZE = 2 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      window.alert("El archivo supera 2 MB. Sube un archivo más pequeño.");
      return;
    }
    if (!active) return;
    const reader = new FileReader();
    reader.onload = () => {
      const data = typeof reader.result === "string" ? reader.result : "";
      if (!data) return;
      const doc: CarDocument = {
        id: uid(),
        vehicleId: active.id,
        name: file.name,
        fileName: file.name,
        mimeType: file.type,
        size: file.size,
        data,
        date: new Date().toISOString().slice(0, 10),
      };
      setState((s) => (s ? { ...s, documents: [...s.documents, doc] } : s));
    };
    reader.readAsDataURL(file);
  };

  const deleteDocument = (id: string) =>
    setState((s) => (s ? { ...s, documents: s.documents.filter((d) => d.id !== id) } : s));

  const addRevision = () => {
    if (!active) return;
    const revision: Revision = {
      id: uid(),
      vehicleId: active.id,
      title: "",
      dueDate: "",
      km: "",
      done: false,
    };
    setState((s) => (s ? { ...s, revisions: [...s.revisions, revision] } : s));
  };

  const updateRevision = (id: string, patch: Partial<Revision>) =>
    setState((s) =>
      s ? { ...s, revisions: s.revisions.map((r) => (r.id === id ? { ...r, ...patch } : r)) } : s
    );

  const deleteRevision = (id: string) =>
    setState((s) => (s ? { ...s, revisions: s.revisions.filter((r) => r.id !== id) } : s));

  const addVehicle = () => {
    const vehicle: Vehicle = {
      id: uid(),
      name: "Nuevo vehículo",
      plate: "",
      year: "",
      currentKm: "",
      maintenance: maintenanceForName(""),
    };
    setState((s) => (s ? { ...s, vehicles: [...s.vehicles, vehicle] } : s));
    setActiveId(vehicle.id);
  };

  const updateMaintenance = (id: string, patch: Partial<MaintenanceItem>) =>
    setState((s) =>
      s
        ? {
            ...s,
            vehicles: s.vehicles.map((v) =>
              v.id === activeId
                ? { ...v, maintenance: v.maintenance.map((i) => (i.id === id ? { ...i, ...patch } : i)) }
                : v
            ),
          }
        : s
    );

  const addMaintenance = () => {
    if (!active) return;
    const item: MaintenanceItem = {
      id: uid(),
      name: "",
      intervalKm: "",
      intervalMonths: "",
      lastKm: "",
      lastDate: "",
    };
    setState((s) =>
      s
        ? {
            ...s,
            vehicles: s.vehicles.map((v) =>
              v.id === active.id ? { ...v, maintenance: [...v.maintenance, item] } : v
            ),
          }
        : s
    );
  };

  const deleteMaintenance = (id: string) =>
    setState((s) =>
      s
        ? {
            ...s,
            vehicles: s.vehicles.map((v) =>
              v.id === activeId
                ? { ...v, maintenance: v.maintenance.filter((i) => i.id !== id) }
                : v
            ),
          }
        : s
    );

  const markMaintenanceDone = (id: string) => {
    if (!active) return;
    updateMaintenance(id, {
      lastKm: active.currentKm,
      lastDate: new Date().toISOString().slice(0, 10),
    });
  };

  const deleteVehicle = (id: string) => {
    if (!state) return;
    setState({
      ...state,
      vehicles: state.vehicles.filter((v) => v.id !== id),
      repairs: state.repairs.filter((r) => r.vehicleId !== id),
      revisions: state.revisions.filter((r) => r.vehicleId !== id),
    });
    setActiveId((cur) => {
      if (cur !== id) return cur;
      const rest = state.vehicles.filter((v) => v.id !== id);
      return rest[0]?.id ?? "";
    });
  };

  return (
    <div className={c.page}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
        <h1 style={{ fontSize: "1.2rem", margin: 0, color: "var(--c-text)" }}>Coches</h1>
        {saveStatus !== "idle" && (
          <span
            role="status"
            style={{
              color: saveStatus === "error" ? "var(--c-danger)" : "var(--c-ok)",
              fontSize: "0.8rem",
            }}
          >
            {saveStatus === "saving" ? "Guardando…" : saveStatus === "saved" ? "Guardado" : "Error al guardar"}
          </span>
        )}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1.25rem" }}>
        {state.vehicles.map((v) => {
          const isActive = v.id === activeId;
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => setActiveId(v.id)}
              style={{
                ...btnStyle,
                background: isActive ? "var(--c-accent)" : "var(--c-border)",
                color: isActive ? "#ffffff" : "var(--c-text)",
                fontWeight: 500,
              }}
            >
              {v.name || "Sin nombre"}
            </button>
          );
        })}
        <button type="button" onClick={addVehicle} style={{ ...btnStyle, border: `1px dashed var(--c-muted)` }}>
          + Añadir
        </button>
      </div>

      {active ? (
        <>
          <div style={{ ...cardStyle, marginBottom: "1.25rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
              <h2 style={{ fontSize: "0.95rem", margin: 0, color: "var(--c-text)", flex: 1 }}>
                Ficha del vehículo
              </h2>
              <button type="button" onClick={() => deleteVehicle(active.id)} style={btnDanger}>
                Eliminar
              </button>
            </div>
            <div style={fieldGrid}>
              <input
                value={active.name}
                onChange={(e) => updateVehicle(active.id, { name: e.target.value })}
                placeholder="Nombre"
                style={inputStyle}
                aria-label="Nombre del vehículo"
              />
              <input
                value={active.plate}
                onChange={(e) => updateVehicle(active.id, { plate: e.target.value })}
                placeholder="Matrícula"
                style={inputStyle}
                aria-label="Matrícula"
              />
              <input
                value={active.year}
                onChange={(e) => updateVehicle(active.id, { year: e.target.value })}
                placeholder="Año"
                style={inputStyle}
                aria-label="Año"
              />
              <input
                value={active.currentKm}
                onChange={(e) => updateVehicle(active.id, { currentKm: e.target.value })}
                placeholder="Km actuales"
                style={inputStyle}
                aria-label="Km actuales"
              />
            </div>
          </div>

          {repairs.length > 0 && (
            <div style={{ ...cardStyle, marginBottom: "1.25rem" }}>
              <h2 style={{ fontSize: "0.95rem", margin: "0 0 0.75rem", color: "var(--c-text)" }}>
                Estadísticas
              </h2>
              {yearStats.length > 0 && (
                <div style={{ marginBottom: "0.75rem" }}>
                  <h3 style={{ fontSize: "0.85rem", margin: "0 0 0.4rem", color: "var(--c-muted)" }}>
                    Coste por año
                  </h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                    {yearStats.map((s) => (
                      <div
                        key={s.label}
                        style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", color: "var(--c-text)" }}
                      >
                        <span>{s.label}</span>
                        <span>{fmtCost(s.total)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {perKm && (
                <p style={{ color: "var(--c-muted)", fontSize: "0.85rem", margin: "0 0 0.75rem" }}>
                  Coste por km: {fmtCost(perKm.total)} ÷{" "}
                  {Number.parseFloat(active?.currentKm ?? "") || 0} km ={" "}
                  <span style={{ color: "var(--c-text)" }}>
                    {eur3Fmt.format(perKm.perKm)}
                  </span>
                  /km
                </p>
              )}
              {componentStats.length > 0 && (
                <div style={{ marginBottom: "0.75rem" }}>
                  <h3 style={{ fontSize: "0.85rem", margin: "0 0 0.4rem", color: "var(--c-muted)" }}>
                    Por componente
                  </h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                    {componentStats.slice(0, 5).map((s) => (
                      <div
                        key={s.label}
                        style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", color: "var(--c-text)" }}
                      >
                        <span>{s.label}</span>
                        <span>{fmtCost(s.total)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {workshopStats.length > 0 && (
                <div>
                  <h3 style={{ fontSize: "0.85rem", margin: "0 0 0.4rem", color: "var(--c-muted)" }}>
                    Por taller
                  </h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                    {workshopStats.slice(0, 5).map((s) => (
                      <div
                        key={s.label}
                        style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", color: "var(--c-text)" }}
                      >
                        <span>{s.label}</span>
                        <span>{fmtCost(s.total)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div style={{ ...cardStyle, marginBottom: "1.25rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
              <h2 style={{ fontSize: "0.95rem", margin: 0, color: "var(--c-text)", flex: 1 }}>
                Mantenimiento
              </h2>
              <button type="button" onClick={addMaintenance} style={btnStyle}>
                + Mantenimiento
              </button>
            </div>
            {active.maintenance.length === 0 && (
              <p style={{ color: "var(--c-muted)", fontSize: "0.85rem", margin: 0 }}>
                Sin elementos de mantenimiento. Añade aceite, filtros, líquido de frenos…
              </p>
            )}
            {active.maintenance.map((m) => {
              const derived = effectiveLastKm(m, repairs, active.id);
              const effectiveItem = { ...m, lastKm: derived.km };
              const status = maintenanceStatus(effectiveItem, active.currentKm);
              return (
                <div
                  key={m.id}
                  style={{
                    border: "1px solid var(--c-border)",
                    borderRadius: 8,
                    padding: "0.5rem",
                    marginBottom: "0.5rem",
                  }}
                >
                  <div style={{ ...fieldGrid, marginBottom: "0.4rem" }}>
                    <input
                      value={m.name}
                      onChange={(e) => updateMaintenance(m.id, { name: e.target.value })}
                      placeholder="Elemento (aceite, filtros…)"
                      style={inputStyle}
                      aria-label="Nombre del mantenimiento"
                    />
                    <input
                      value={m.intervalKm}
                      onChange={(e) => updateMaintenance(m.id, { intervalKm: e.target.value })}
                      placeholder="Cada X km"
                      style={inputStyle}
                      aria-label="Intervalo en kilómetros"
                    />
                    <input
                      value={m.intervalMonths}
                      onChange={(e) => updateMaintenance(m.id, { intervalMonths: e.target.value })}
                      placeholder="Cada X meses"
                      style={inputStyle}
                      aria-label="Intervalo en meses"
                    />
                    <input
                      value={m.warnKm ?? ""}
                      onChange={(e) => updateMaintenance(m.id, { warnKm: e.target.value })}
                      placeholder="Avisar a X km"
                      style={inputStyle}
                      aria-label="Avisar a X kilómetros de margen"
                      title="Con cuántos km de margen pasar a 'próximo' (vacío = 2000)"
                    />
                    <input
                      value={m.warnMonths ?? ""}
                      onChange={(e) => updateMaintenance(m.id, { warnMonths: e.target.value })}
                      placeholder="Avisar a X meses"
                      style={inputStyle}
                      aria-label="Avisar a X meses de margen"
                      title="Con cuántos meses de margen pasar a 'próximo' (vacío = 2)"
                    />
                    <input
                      value={derived.km}
                      readOnly
                      placeholder="Últ. cambio km"
                      style={{ ...inputStyle, background: "var(--c-surface)", color: "var(--c-muted)" }}
                      aria-label="Último cambio en kilómetros (automático)"
                      title={derived.source === "auto" ? "Automático desde la reparación" : undefined}
                    />
                    <input
                      type="date"
                      value={m.lastDate}
                      onChange={(e) => updateMaintenance(m.id, { lastDate: e.target.value })}
                      style={inputStyle}
                      aria-label="Fecha del último cambio"
                    />
                    <button type="button" onClick={() => markMaintenanceDone(m.id)} style={btnStyle}>
                      Hecho
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteMaintenance(m.id)}
                      style={btnDanger}
                      aria-label="Eliminar mantenimiento"
                    >
                      ✕
                    </button>
                  </div>
                  <p
                    style={{
                      color: MNT_STATUS_COLORS[status],
                      fontSize: "0.8rem",
                      margin: "0 0 0.2rem",
                    }}
                  >
                    {maintenanceMessage(effectiveItem, active.currentKm)}
                  </p>
                  {derived.source === "auto" && derived.repair ? (
                    <p style={{ color: "var(--c-muted)", fontSize: "0.75rem", margin: 0 }}>
                      Automático · de la reparación “{derived.repair.description}” (
                      {derived.repair.date || "sin fecha"})
                    </p>
                  ) : derived.source === "manual" ? (
                    <p style={{ color: "var(--c-muted)", fontSize: "0.75rem", margin: 0 }}>
                      Km manual (sin reparación coincidente)
                    </p>
                  ) : (
                    <p style={{ color: "var(--c-muted)", fontSize: "0.75rem", margin: 0 }}>
                      Sin dato: añade una reparación con su km, p. ej. “Cambio de aceite”
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ ...cardStyle, marginBottom: "1.25rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
              <h2 style={{ fontSize: "0.95rem", margin: 0, color: "var(--c-text)", flex: 1 }}>Talleres</h2>
            </div>
            <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
              <input
                value={newWorkshop}
                onChange={(e) => setNewWorkshop(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addWorkshop();
                }}
                placeholder="Nombre del taller"
                style={{ ...inputStyle, flex: 1 }}
                aria-label="Nuevo taller"
              />
              <button type="button" onClick={addWorkshop} style={btnStyle}>
                Añadir
              </button>
            </div>
            {state.workshops.length === 0 ? (
              <p style={{ color: "var(--c-muted)", fontSize: "0.85rem", margin: 0 }}>
                Sin talleres. Añádelos y podrás elegirlos en las reparaciones.
              </p>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                {state.workshops.map((w) => (
                  <span
                    key={w}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.4rem",
                      background: "var(--c-border)",
                      border: "1px solid var(--c-border)",
                      borderRadius: 999,
                      padding: "0.2rem 0.6rem",
                      fontSize: "0.8rem",
                      color: "var(--c-text)",
                    }}
                  >
                    {w}
                    <button
                      type="button"
                      onClick={() => deleteWorkshop(w)}
                      style={{ ...btnDanger, padding: 0, border: "none", fontSize: "0.8rem" }}
                      aria-label={`Eliminar taller ${w}`}
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div style={{ ...cardStyle, marginBottom: "1.25rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
              <h2 style={{ fontSize: "0.95rem", margin: 0, color: "var(--c-text)", flex: 1 }}>
                Reparaciones
                <span style={{ color: "var(--c-muted)", fontSize: "0.8rem", fontWeight: 400, marginLeft: "0.5rem" }}>
                  Total: {fmtCost(totalCost)}
                </span>
              </h2>
              <button type="button" onClick={addRepair} style={btnStyle}>
                + Reparación
              </button>
            </div>
            {repairs.length === 0 ? (
              <p style={{ color: "var(--c-muted)", fontSize: "0.85rem", margin: 0 }}>Sin reparaciones registradas.</p>
            ) : (
              <>
                {(usedComponents.length > 0 || usedWorkshops.length > 0 || usedYears.length > 0) && (
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "0.5rem",
                      marginBottom: "0.75rem",
                    }}
                  >
                    {usedComponents.length > 0 && (
                      <select
                        value={filterComponent}
                        onChange={(e) => setFilterComponent(e.target.value)}
                        style={{ ...inputStyle, flex: 1, minWidth: "120px" }}
                        aria-label="Filtrar por componente"
                      >
                        <option value="">Componente: todos</option>
                        {usedComponents.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    )}
                    {usedWorkshops.length > 0 && (
                      <select
                        value={filterWorkshop}
                        onChange={(e) => setFilterWorkshop(e.target.value)}
                        style={{ ...inputStyle, flex: 1, minWidth: "120px" }}
                        aria-label="Filtrar por taller"
                      >
                        <option value="">Taller: todos</option>
                        {usedWorkshops.map((w) => (
                          <option key={w} value={w}>
                            {w}
                          </option>
                        ))}
                      </select>
                    )}
                    {usedYears.length > 0 && (
                      <select
                        value={filterYear}
                        onChange={(e) => setFilterYear(e.target.value)}
                        style={{ ...inputStyle, flex: 1, minWidth: "110px" }}
                        aria-label="Filtrar por año"
                      >
                        <option value="">Año: todos</option>
                        {usedYears.map((y) => (
                          <option key={y} value={y}>
                            {y}
                          </option>
                        ))}
                      </select>
                    )}
                    {hasRepairFilters && (
                      <button
                        type="button"
                        onClick={() => {
                          setFilterComponent("");
                          setFilterWorkshop("");
                          setFilterYear("");
                        }}
                        style={btnStyle}
                      >
                        Limpiar
                      </button>
                    )}
                  </div>
                )}
                {filteredRepairs.length === 0 && (
                  <p style={{ color: "var(--c-muted)", fontSize: "0.85rem", marginBottom: "0.5rem" }}>
                    Sin reparaciones con los filtros aplicados.
                  </p>
                )}
              </>
            )}
            {filteredRepairs.map((r) => (
              <div key={r.id} style={{ ...fieldGrid, marginBottom: "0.5rem" }}>
                <input
                  type="date"
                  value={r.date}
                  onChange={(e) => updateRepair(r.id, { date: e.target.value })}
                  style={inputStyle}
                  aria-label="Fecha de la reparación"
                />
                <input
                  value={r.description}
                  onChange={(e) => updateRepair(r.id, { description: e.target.value })}
                  placeholder="Descripción"
                  style={inputStyle}
                  aria-label="Descripción"
                />
                <input
                  value={r.cost}
                  onChange={(e) => updateRepair(r.id, { cost: e.target.value })}
                  placeholder="Coste (€)"
                  style={inputStyle}
                  aria-label="Coste"
                />
                <input
                  value={r.km}
                  onChange={(e) => updateRepair(r.id, { km: e.target.value })}
                  placeholder="Km"
                  style={inputStyle}
                  aria-label="Kilómetros"
                />
                {(() => {
                  const isOther =
                    r.component === "__other" ||
                    (r.component !== "" && !componentOptions.includes(r.component));
                  if (!isOther) {
                    return (
                      <select
                        value={r.component}
                        onChange={(e) =>
                          updateRepair(r.id, { component: e.target.value === "__other" ? "__other" : e.target.value })
                        }
                        style={inputStyle}
                        aria-label="Componente"
                      >
                        <option value="">Componente</option>
                        {componentOptions.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                        <option value="__other">Otro…</option>
                      </select>
                    );
                  }
                  return (
                    <input
                      value={r.component === "__other" ? "" : r.component}
                      onChange={(e) => updateRepair(r.id, { component: e.target.value })}
                      placeholder="Componente (otro)"
                      style={inputStyle}
                      aria-label="Componente (personalizado)"
                    />
                  );
                })()}
                {state.workshops.length > 0 ? (
                  <select
                    value={r.workshop}
                    onChange={(e) => updateRepair(r.id, { workshop: e.target.value })}
                    style={inputStyle}
                    aria-label="Taller"
                  >
                    <option value="">Taller</option>
                    {Array.from(
                      new Set(state.workshops.concat(r.workshop ? [r.workshop] : []))
                    ).map((w) => (
                      <option key={w} value={w}>
                        {w}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={r.workshop}
                    onChange={(e) => updateRepair(r.id, { workshop: e.target.value })}
                    placeholder="Taller"
                    style={inputStyle}
                    aria-label="Taller"
                  />
                )}
                <button
                  type="button"
                  onClick={() => deleteRepair(r.id)}
                  style={btnDanger}
                  aria-label="Eliminar reparación"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <div style={{ ...cardStyle, marginBottom: "1.25rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
              <h2 style={{ fontSize: "0.95rem", margin: 0, color: "var(--c-text)", flex: 1 }}>Documentos</h2>
            </div>
            <input
              type="file"
              accept=".pdf,image/*"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) addDocument(f);
                e.target.value = "";
              }}
              style={{ ...inputStyle, color: "var(--c-muted)", marginBottom: "0.75rem" }}
              aria-label="Subir documento"
            />
            {activeDocs.length === 0 ? (
              <p style={{ color: "var(--c-muted)", fontSize: "0.85rem", margin: 0 }}>
                Sin documentos. Sube facturas, informes o lo que quieras (máx. 2 MB).
              </p>
            ) : (
              activeDocs.map((d) => (
                <div
                  key={d.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    marginBottom: "0.5rem",
                    flexWrap: "wrap",
                  }}
                >
                  <span style={{ color: "var(--c-text)", fontSize: "0.85rem", flex: 1, minWidth: "140px" }}>
                    {d.name}
                  </span>
                  <span style={{ color: "var(--c-muted)", fontSize: "0.75rem", whiteSpace: "nowrap" }}>
                    {fmtSize(d.size)} · {d.date}
                  </span>
                  <a
                    href={d.data}
                    download={d.fileName}
                    style={{ ...btnStyle, textDecoration: "none", display: "inline-block" }}
                  >
                    Descargar
                  </a>
                  <button
                    type="button"
                    onClick={() => deleteDocument(d.id)}
                    style={btnDanger}
                    aria-label={`Eliminar documento ${d.name}`}
                  >
                    ✕
                  </button>
                </div>
              ))
            )}
          </div>

          <div style={cardStyle}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
              <h2 style={{ fontSize: "0.95rem", margin: 0, color: "var(--c-text)", flex: 1 }}>
                Revisiones
                <span style={{ color: "var(--c-muted)", fontSize: "0.8rem", fontWeight: 400, marginLeft: "0.5rem" }}>
                  {pendingCount} pendiente{pendingCount === 1 ? "" : "s"}
                </span>
              </h2>
              <button type="button" onClick={addRevision} style={btnStyle}>
                + Revisión
              </button>
            </div>
            {revisions.length === 0 && (
              <p style={{ color: "var(--c-muted)", fontSize: "0.85rem", margin: 0 }}>Sin revisiones programadas.</p>
            )}
            {revisions.map((r) => {
              const status = revisionStatus(r);
              return (
                <div
                  key={r.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    marginBottom: "0.5rem",
                    flexWrap: "wrap",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={r.done}
                    onChange={(e) => updateRevision(r.id, { done: e.target.checked })}
                    style={{ width: 18, height: 18, accentColor: "var(--c-ok)" }}
                    aria-label="Marcar como hecha"
                  />
                  <input
                    value={r.title}
                    onChange={(e) => updateRevision(r.id, { title: e.target.value })}
                    placeholder="Revisión (ITV, aceite…)"
                    style={{ ...inputStyle, flex: 1, minWidth: "150px" }}
                    aria-label="Título de la revisión"
                  />
                  <input
                    type="date"
                    value={r.dueDate}
                    onChange={(e) => updateRevision(r.id, { dueDate: e.target.value })}
                    style={inputStyle}
                    aria-label="Fecha prevista"
                  />
                  <input
                    value={r.km}
                    onChange={(e) => updateRevision(r.id, { km: e.target.value })}
                    placeholder="Km"
                    style={{ ...inputStyle, width: "100px" }}
                    aria-label="Kilómetros previstos"
                  />
                  <span
                    style={{
                      padding: "0.15rem 0.5rem",
                      borderRadius: 999,
                      fontSize: "0.75rem",
                      background: STATUS_COLORS[status],
                      color: "var(--c-card)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {revisionStatusLabel(status)}
                  </span>
                  <button
                    type="button"
                    onClick={() => deleteRevision(r.id)}
                    style={btnDanger}
                    aria-label="Eliminar revisión"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div style={{ color: "var(--c-muted)", fontSize: "0.9rem" }}>
          No hay vehículos. Pulsa “+ Añadir” para crear uno.
        </div>
      )}
    </div>
  );
}