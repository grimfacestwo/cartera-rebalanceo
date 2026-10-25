"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import c from "./lectura.module.css";
import {
  groupReadBooksByYear,
  moveFutureBook,
  parseBookCovers,
  parseLecturaState,
  type Book,
  type BookStatus,
} from "@/lib/books";

type SaveStatus = "idle" | "saving" | "saved" | "error";

function uid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const inputStyle: CSSProperties = {
  padding: "0.5rem",
  background: "var(--c-surface)",
  border: "1px solid var(--c-border)",
  borderRadius: 8,
  color: "var(--c-text)",
  fontSize: "0.85rem",
  fontFamily: "inherit",
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

const btnDanger: CSSProperties = { ...btnStyle, background: "transparent", color: "var(--c-danger)" };
const btnAccent: CSSProperties = { ...btnStyle, background: "var(--c-accent)", color: "#ffffff" };

const cardStyle: CSSProperties = {
  padding: "1.25rem 1.5rem",
  background: "var(--c-card)",
  border: "1px solid var(--c-border)",
  borderRadius: 12,
  boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
  marginBottom: "1rem",
};

async function saveLectura(
  books: Book[],
  covers: Record<string, string>,
  setStatus: (s: SaveStatus) => void
) {
  setStatus("saving");
  let mainOk = false;
  for (let i = 0; i < 2 && !mainOk; i++) {
    try {
      const res = await fetch("/api/section/lectura", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ books }),
      });
      mainOk = res.ok;
    } catch {
      mainOk = false;
    }
  }
  let coversOk = false;
  for (let i = 0; i < 2 && !coversOk; i++) {
    try {
      const res = await fetch("/api/section/lectura-covers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(covers),
      });
      coversOk = res.ok;
    } catch {
      coversOk = false;
    }
  }
  setStatus(mainOk && coversOk ? "saved" : "error");
}

function CoverThumb({ src, title, width, height }: { src: string | undefined; title: string; width: number; height: number }) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- data: URI guardada en Postgres, no hay dominio externo que optimizar
      <img
        src={src}
        alt={`Portada de ${title}`}
        width={width}
        height={height}
        style={{ width, height, objectFit: "cover", borderRadius: 6, flexShrink: 0 }}
      />
    );
  }
  return (
    <div
      style={{
        width,
        height,
        borderRadius: 6,
        background: "var(--c-surface)",
        color: "var(--c-muted)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "0.7rem",
        textAlign: "center",
        padding: "0.3rem",
        flexShrink: 0,
      }}
    >
      Sin portada
    </div>
  );
}

function AddBookForm({
  placeholder,
  showYear,
  onAdd,
}: {
  placeholder: string;
  showYear?: boolean;
  onAdd: (title: string, author: string, year: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [year, setYear] = useState(() => String(new Date().getFullYear()));

  const submit = () => {
    const t = title.trim();
    if (!t) return;
    onAdd(t, author.trim(), year.trim());
    setTitle("");
    setAuthor("");
  };

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "0.75rem" }}>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={placeholder}
        style={{ ...inputStyle, flex: "2 1 10rem" }}
        aria-label="Título del libro"
        onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
      />
      <input
        value={author}
        onChange={(e) => setAuthor(e.target.value)}
        placeholder="Autor (opcional)"
        style={{ ...inputStyle, flex: "1 1 8rem" }}
        aria-label="Autor del libro"
        onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
      />
      {showYear && (
        <input
          value={year}
          onChange={(e) => { if (/^\d{0,4}$/.test(e.target.value)) setYear(e.target.value); }}
          placeholder="Año"
          style={{ ...inputStyle, width: "5rem" }}
          aria-label="Año de lectura"
        />
      )}
      <button type="button" onClick={submit} style={btnAccent}>+ Añadir</button>
    </div>
  );
}

export default function LecturaManager() {
  const [books, setBooks] = useState<Book[] | null>(null);
  const [covers, setCovers] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [fetchingCovers, setFetchingCovers] = useState<Set<string>>(new Set());
  const [collapsedYears, setCollapsedYears] = useState<Set<string>>(new Set());
  const [markingReadId, setMarkingReadId] = useState<string | null>(null);
  const [markYear, setMarkYear] = useState("");
  const skipOnce = useRef(true);
  const pendingRef = useRef<{ books: Book[]; covers: Record<string, string> } | null>(null);

  // --- Load ---
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [booksRes, coversRes] = await Promise.all([
          fetch("/api/section/lectura"),
          fetch("/api/section/lectura-covers"),
        ]);
        if (!booksRes.ok) throw new Error("no data");
        const booksData = (await booksRes.json()) as { data?: unknown };
        const coversData = coversRes.ok ? ((await coversRes.json()) as { data?: unknown }) : { data: {} };
        if (!cancelled) {
          setBooks(parseLecturaState(booksData.data).books);
          setCovers(parseBookCovers(coversData.data));
          setLoadError(false);
        }
      } catch {
        if (!cancelled) setLoadError(true);
      }
    })();
    return () => { cancelled = true; };
  }, [reloadKey]);

  // --- Save (debounced) ---
  useEffect(() => {
    if (!books || loadError) return;
    if (skipOnce.current) { skipOnce.current = false; return; }
    pendingRef.current = { books, covers };
    const timer = setTimeout(() => {
      void saveLectura(books, covers, setSaveStatus);
    }, 500);
    return () => clearTimeout(timer);
  }, [books, covers, loadError]);

  // --- Flush on unload, igual que Coches ---
  useEffect(() => {
    const flush = () => {
      const p = pendingRef.current;
      if (!p) return;
      try {
        fetch("/api/section/lectura", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ books: p.books }),
          keepalive: true,
        });
        fetch("/api/section/lectura-covers", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(p.covers),
          keepalive: true,
        });
      } catch {
        /* ignore */
      }
    };
    const onVisibility = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const retry = () => {
    setLoadError(false);
    setBooks(null);
    setReloadKey((k) => k + 1);
  };

  const fetchCover = async (id: string, title: string, author: string) => {
    setFetchingCovers((s) => new Set(s).add(id));
    try {
      const q = new URLSearchParams({ title, author });
      const res = await fetch(`/api/book-cover?${q}`);
      if (res.ok) {
        const data = (await res.json()) as { cover: string | null };
        if (data.cover) setCovers((prev) => ({ ...prev, [id]: data.cover! }));
      }
    } catch {
      /* sin portada, se puede reintentar a mano */
    } finally {
      setFetchingCovers((s) => { const next = new Set(s); next.delete(id); return next; });
    }
  };

  const addBook = (status: BookStatus) => (title: string, author: string, year: string) => {
    const id = uid();
    const book: Book = { id, title, author, status, yearFinished: status === "read" ? year : "" };
    setBooks((prev) => [...(prev ?? []), book]);
    void fetchCover(id, title, author);
  };

  const deleteBook = (id: string) => {
    setBooks((prev) => (prev ?? []).filter((b) => b.id !== id));
    setCovers((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const setStatus = (id: string, status: BookStatus, yearFinished = "") => {
    setBooks((prev) => (prev ?? []).map((b) => (b.id === id ? { ...b, status, yearFinished } : b)));
  };

  const confirmMarkRead = (id: string) => {
    setStatus(id, "read", markYear.trim() || String(new Date().getFullYear()));
    setMarkingReadId(null);
  };

  const moveFuture = (id: string, direction: "up" | "down") => {
    setBooks((prev) => (prev ? moveFutureBook(prev, id, direction) : prev));
  };

  const toggleYear = (year: string) => {
    setCollapsedYears((prev) => {
      const next = new Set(prev);
      if (next.has(year)) next.delete(year);
      else next.add(year);
      return next;
    });
  };

  if (loadError) {
    return (
      <div className={c.page}>
        <p style={{ color: "var(--c-muted)" }}>No se pudo cargar el contenido.</p>
        <button type="button" onClick={retry} style={btnStyle}>Reintentar</button>
      </div>
    );
  }

  if (!books) {
    return (
      <div className={c.page}>
        <p style={{ color: "var(--c-muted)" }}>Cargando…</p>
      </div>
    );
  }

  const reading = books.filter((b) => b.status === "reading");
  const future = books.filter((b) => b.status === "future");
  const yearGroups = groupReadBooksByYear(books);

  return (
    <div className={c.page}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
        <h1 style={{ fontSize: "1.2rem", margin: 0, color: "var(--c-text)" }}>Lectura</h1>
        {saveStatus !== "idle" && (
          <span
            role="status"
            style={{ color: saveStatus === "error" ? "var(--c-danger)" : "var(--c-ok)", fontSize: "0.8rem" }}
          >
            {saveStatus === "saving" ? "Guardando…" : saveStatus === "saved" ? "Guardado" : "Error al guardar"}
          </span>
        )}
      </div>

      {/* Leyendo ahora */}
      <section style={cardStyle}>
        <h2 style={{ fontSize: "0.95rem", margin: "0 0 0.75rem", color: "var(--c-text)" }}>Leyendo ahora</h2>
        {reading.length === 0 ? (
          <p style={{ color: "var(--c-muted)", fontSize: "0.85rem" }}>Nada en marcha ahora mismo.</p>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.9rem" }}>
            {reading.map((b) => (
              <div key={b.id} style={{ width: "8.5rem" }}>
                <CoverThumb src={covers[b.id]} title={b.title} width={136} height={200} />
                <p style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--c-text)", margin: "0.4rem 0 0" }}>{b.title}</p>
                {b.author && <p style={{ fontSize: "0.76rem", color: "var(--c-muted)", margin: "0.1rem 0 0" }}>{b.author}</p>}
                {markingReadId === b.id ? (
                  <div style={{ display: "flex", gap: "0.3rem", marginTop: "0.4rem" }}>
                    <input
                      value={markYear}
                      onChange={(e) => { if (/^\d{0,4}$/.test(e.target.value)) setMarkYear(e.target.value); }}
                      style={{ ...inputStyle, width: "4rem", padding: "0.3rem" }}
                      aria-label={`Año en que terminaste ${b.title}`}
                      autoFocus
                    />
                    <button type="button" onClick={() => confirmMarkRead(b.id)} style={{ ...btnAccent, padding: "0.3rem 0.5rem" }}>✓</button>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem", marginTop: "0.4rem" }}>
                    <button
                      type="button"
                      onClick={() => { setMarkingReadId(b.id); setMarkYear(String(new Date().getFullYear())); }}
                      style={{ ...btnStyle, padding: "0.3rem 0.5rem", fontSize: "0.75rem" }}
                    >
                      ✓ Leído
                    </button>
                    <button
                      type="button"
                      onClick={() => setStatus(b.id, "future")}
                      style={{ ...btnStyle, padding: "0.3rem 0.5rem", fontSize: "0.75rem" }}
                      title="Mover a próximas lecturas"
                    >
                      ⏸
                    </button>
                    {!covers[b.id] && (
                      <button
                        type="button"
                        onClick={() => void fetchCover(b.id, b.title, b.author)}
                        disabled={fetchingCovers.has(b.id)}
                        style={{ ...btnStyle, padding: "0.3rem 0.5rem", fontSize: "0.75rem" }}
                        title="Buscar portada"
                      >
                        {fetchingCovers.has(b.id) ? "…" : "↻"}
                      </button>
                    )}
                    <button type="button" onClick={() => deleteBook(b.id)} style={{ ...btnDanger, padding: "0.3rem 0.5rem", fontSize: "0.75rem" }}>×</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        <AddBookForm placeholder="Ej. Dune" onAdd={addBook("reading")} />
      </section>

      {/* Próximas lecturas */}
      <section style={cardStyle}>
        <h2 style={{ fontSize: "0.95rem", margin: "0 0 0.75rem", color: "var(--c-text)" }}>Próximas lecturas</h2>
        {future.length === 0 ? (
          <p style={{ color: "var(--c-muted)", fontSize: "0.85rem" }}>No tienes nada en la lista de espera.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {future.map((b, idx) => (
              <div key={b.id} style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                <CoverThumb src={covers[b.id]} title={b.title} width={34} height={50} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--c-text)", margin: 0 }}>{b.title}</p>
                  {b.author && <p style={{ fontSize: "0.76rem", color: "var(--c-muted)", margin: 0 }}>{b.author}</p>}
                </div>
                <button type="button" onClick={() => moveFuture(b.id, "up")} disabled={idx === 0} style={{ ...btnStyle, padding: "0.25rem 0.5rem" }} aria-label={`Subir ${b.title}`}>▲</button>
                <button type="button" onClick={() => moveFuture(b.id, "down")} disabled={idx === future.length - 1} style={{ ...btnStyle, padding: "0.25rem 0.5rem" }} aria-label={`Bajar ${b.title}`}>▼</button>
                <button type="button" onClick={() => setStatus(b.id, "reading")} style={{ ...btnStyle, padding: "0.25rem 0.6rem", fontSize: "0.78rem" }}>▶ Empezar</button>
                <button type="button" onClick={() => deleteBook(b.id)} style={{ ...btnDanger, padding: "0.25rem 0.5rem" }}>×</button>
              </div>
            ))}
          </div>
        )}
        <AddBookForm placeholder="Ej. Project Hail Mary" onAdd={addBook("future")} />
      </section>

      {/* Leídos, agrupados por año */}
      <section style={cardStyle}>
        <h2 style={{ fontSize: "0.95rem", margin: "0 0 0.75rem", color: "var(--c-text)" }}>Leídos</h2>
        {yearGroups.length === 0 ? (
          <p style={{ color: "var(--c-muted)", fontSize: "0.85rem" }}>Aún no has marcado ningún libro como leído.</p>
        ) : (
          yearGroups.map((group) => {
            const collapsed = collapsedYears.has(group.year);
            return (
              <div key={group.year} style={{ marginBottom: "0.75rem" }}>
                <button
                  type="button"
                  onClick={() => toggleYear(group.year)}
                  style={{
                    ...btnStyle,
                    width: "100%",
                    justifyContent: "flex-start",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.4rem",
                    background: "var(--c-surface)",
                    fontWeight: 600,
                  }}
                  aria-expanded={!collapsed}
                >
                  <span>{collapsed ? "▶" : "▼"}</span>
                  {group.year} ({group.books.length})
                </button>
                {!collapsed && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.8rem", marginTop: "0.6rem" }}>
                    {group.books.map((b) => (
                      <div key={b.id} style={{ width: "6.5rem" }}>
                        <CoverThumb src={covers[b.id]} title={b.title} width={104} height={152} />
                        <p style={{ fontSize: "0.76rem", fontWeight: 600, color: "var(--c-text)", margin: "0.3rem 0 0" }}>{b.title}</p>
                        {b.author && <p style={{ fontSize: "0.7rem", color: "var(--c-muted)", margin: 0 }}>{b.author}</p>}
                        <button type="button" onClick={() => deleteBook(b.id)} style={{ ...btnDanger, padding: "0.2rem 0.4rem", fontSize: "0.7rem", marginTop: "0.2rem" }}>Eliminar</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
        <AddBookForm placeholder="Ej. 1984" showYear onAdd={addBook("read")} />
      </section>
    </div>
  );
}
