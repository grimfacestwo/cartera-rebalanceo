"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  type CochesState,
  type Repair,
  type Revision,
  type RevisionStatus,
  type Vehicle,
  parseCochesState,
  revisionStatus,
  revisionStatusLabel,
} from "@/lib/coches";

type SaveStatus = "idle" | "saving" | "saved" | "error";

const STATUS_COLORS: Record<RevisionStatus, string> = {
  done: "#22c55e",
  overdue: "#ef4444",
  soon: "#f59e0b",
  future: "#94a3b8",
};

const inputStyle: CSSProperties = {
  padding: "0.5rem",
  background: "#1e293b",
  border: "1px solid #334155",
  borderRadius: 8,
  color: "#e2e8f0",
  fontSize: "0.85rem",
  fontFamily: "inherit",
};

const btnStyle: CSSProperties = {
  padding: "0.4rem 0.9rem",
  background: "#334155",
  color: "#e2e8f0",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: "0.85rem",
  whiteSpace: "nowrap",
};

const btnDanger: CSSProperties = {
  ...btnStyle,
  background: "transparent",
  color: "#ef4444",
};

const cardStyle: CSSProperties = {
  padding: "0.75rem",
  background: "#0f172a",
  border: "1px solid #1e293b",
  borderRadius: 10,
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

function fmtCost(total: number): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(total);
}

export default function CochesManager() {
  const [state, setState] = useState<CochesState | null>(null);
  const [activeId, setActiveId] = useState("");
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const skipOnce = useRef(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/section/coches");
        if (!res.ok) throw new Error("no data");
        const data = (await res.json()) as { data?: unknown };
        const parsed = parseCochesState(data.data);
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
    const timer = setTimeout(() => {
      setSaveStatus("saving");
      fetch("/api/section/coches", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state),
      })
        .then((res) => setSaveStatus(res.ok ? "saved" : "error"))
        .catch(() => setSaveStatus("error"));
    }, 500);
    return () => clearTimeout(timer);
  }, [state, loadError]);

  const retry = () => {
    setLoadError(false);
    setState(null);
    setReloadKey((k) => k + 1);
  };

  if (loadError) {
    return (
      <div style={{ padding: "1.5rem" }}>
        <p style={{ color: "#94a3b8" }}>No se pudo cargar el contenido.</p>
        <button type="button" onClick={retry} style={btnStyle}>
          Reintentar
        </button>
      </div>
    );
  }

  if (!state) {
    return (
      <div style={{ padding: "1.5rem" }}>
        <p style={{ color: "#94a3b8" }}>Cargando…</p>
      </div>
    );
  }

  const active = state.vehicles.find((v) => v.id === activeId) ?? null;
  const repairs = active
    ? state.repairs
        .filter((r) => r.vehicleId === active.id)
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    : [];
  const totalCost = repairs.reduce((s, r) => s + (Number.parseFloat(r.cost) || 0), 0);
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
    };
    setState((s) => (s ? { ...s, repairs: [...s.repairs, repair] } : s));
  };

  const updateRepair = (id: string, patch: Partial<Repair>) =>
    setState((s) =>
      s ? { ...s, repairs: s.repairs.map((r) => (r.id === id ? { ...r, ...patch } : r)) } : s
    );

  const deleteRepair = (id: string) =>
    setState((s) => (s ? { ...s, repairs: s.repairs.filter((r) => r.id !== id) } : s));

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
    };
    setState((s) => (s ? { ...s, vehicles: [...s.vehicles, vehicle] } : s));
    setActiveId(vehicle.id);
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
    <div style={{ padding: "1.5rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
        <h1 style={{ fontSize: "1.2rem", margin: 0, color: "#e2e8f0" }}>Coches</h1>
        {saveStatus !== "idle" && (
          <span
            role="status"
            style={{
              color: saveStatus === "error" ? "#ef4444" : "#22c55e",
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
                background: isActive ? "#3b82f6" : "#1e293b",
                color: isActive ? "#ffffff" : "#e2e8f0",
                fontWeight: 500,
              }}
            >
              {v.name || "Sin nombre"}
            </button>
          );
        })}
        <button type="button" onClick={addVehicle} style={{ ...btnStyle, border: "1px dashed #475569" }}>
          + Añadir
        </button>
      </div>

      {active ? (
        <>
          <div style={{ ...cardStyle, marginBottom: "1.25rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
              <h2 style={{ fontSize: "0.95rem", margin: 0, color: "#e2e8f0", flex: 1 }}>
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

          <div style={{ ...cardStyle, marginBottom: "1.25rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
              <h2 style={{ fontSize: "0.95rem", margin: 0, color: "#e2e8f0", flex: 1 }}>
                Reparaciones
                <span style={{ color: "#94a3b8", fontSize: "0.8rem", fontWeight: 400, marginLeft: "0.5rem" }}>
                  Total: {fmtCost(totalCost)}
                </span>
              </h2>
              <button type="button" onClick={addRepair} style={btnStyle}>
                + Reparación
              </button>
            </div>
            {repairs.length === 0 && <p style={{ color: "#94a3b8", fontSize: "0.85rem", margin: 0 }}>Sin reparaciones registradas.</p>}
            {repairs.map((r) => (
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
                <input
                  value={r.workshop}
                  onChange={(e) => updateRepair(r.id, { workshop: e.target.value })}
                  placeholder="Taller"
                  style={inputStyle}
                  aria-label="Taller"
                />
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

          <div style={cardStyle}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
              <h2 style={{ fontSize: "0.95rem", margin: 0, color: "#e2e8f0", flex: 1 }}>
                Revisiones
                <span style={{ color: "#94a3b8", fontSize: "0.8rem", fontWeight: 400, marginLeft: "0.5rem" }}>
                  {pendingCount} pendiente{pendingCount === 1 ? "" : "s"}
                </span>
              </h2>
              <button type="button" onClick={addRevision} style={btnStyle}>
                + Revisión
              </button>
            </div>
            {revisions.length === 0 && (
              <p style={{ color: "#94a3b8", fontSize: "0.85rem", margin: 0 }}>Sin revisiones programadas.</p>
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
                    style={{ width: 18, height: 18, accentColor: "#22c55e" }}
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
                      color: "#0f172a",
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
        <div style={{ color: "#94a3b8", fontSize: "0.9rem" }}>
          No hay vehículos. Pulsa “+ Añadir” para crear uno.
        </div>
      )}
    </div>
  );
}