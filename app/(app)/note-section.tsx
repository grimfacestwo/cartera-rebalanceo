"use client";

import { useEffect, useRef, useState } from "react";

type SaveStatus = "idle" | "saving" | "saved" | "error";

export default function NoteSection({ slug }: { slug: string }) {
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const skipOnce = useRef(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/section/${slug}`);
        if (!res.ok) throw new Error("no data");
        const data = (await res.json()) as { data?: { note?: string } };
        if (!cancelled) {
          setNote(String(data.data?.note ?? ""));
          setLoadError(false);
        }
      } catch {
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, reloadKey]);

  useEffect(() => {
    if (loading || loadError) return;
    if (skipOnce.current) {
      skipOnce.current = false;
      return;
    }
    const timer = setTimeout(() => {
      setSaveStatus("saving");
      fetch(`/api/section/${slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      })
        .then((res) => setSaveStatus(res.ok ? "saved" : "error"))
        .catch(() => setSaveStatus("error"));
    }, 500);
    return () => clearTimeout(timer);
  }, [note, slug, loading, loadError]);

  const retry = () => {
    setLoadError(false);
    setLoading(true);
    setReloadKey((k) => k + 1);
  };

  if (loading) {
    return (
      <div style={{ padding: "1.5rem" }}>
        <p style={{ color: "#94a3b8" }}>Cargando…</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div style={{ padding: "1.5rem" }}>
        <p style={{ color: "#94a3b8" }}>No se pudo cargar el contenido.</p>
        <button
          type="button"
          onClick={retry}
          style={{
            marginTop: "0.5rem",
            padding: "0.4rem 1rem",
            background: "#334155",
            color: "#e2e8f0",
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
          }}
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: "1.5rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Escribe aquí..."
          rows={10}
          style={{
            flex: 1,
            padding: "0.75rem",
            background: "#1e293b",
            border: "1px solid #334155",
            borderRadius: 8,
            color: "#e2e8f0",
            fontSize: "0.9rem",
            resize: "vertical",
            fontFamily: "inherit",
          }}
          aria-label="Nota"
        />
      </div>
      {saveStatus !== "idle" && (
        <p
          role="status"
          style={{
            color: saveStatus === "error" ? "#ef4444" : "#22c55e",
            fontSize: "0.8rem",
            margin: "0.5rem 0 0",
          }}
        >
          {saveStatus === "saving"
            ? "Guardando…"
            : saveStatus === "saved"
              ? "Guardado"
              : "Error al guardar"}
        </p>
      )}
    </div>
  );
}
