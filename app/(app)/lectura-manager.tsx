"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import c from "./lectura.module.css";
import { putSection } from "@/lib/section-persist";
import {
  bookProgress,
  computeReadingStats,
  moveFutureBook,
  parseBookCovers,
  parseLecturaState,
  type Book,
  type BookStatus,
} from "@/lib/books";

type SaveStatus = "idle" | "saving" | "saved" | "error" | "conflict";
type LecturaVersions = { lectura: number | null; lecturaCovers: number | null };
type FilterValue = "all" | BookStatus;

function uid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const STATUS_ORDER: BookStatus[] = ["reading", "future", "read", "abandoned"];
const STATUS_LABEL: Record<BookStatus, string> = {
  reading: "Leyendo",
  future: "Pendiente",
  read: "Terminado",
  abandoned: "Abandonado",
};
const STATUS_COLOR: Record<BookStatus, string> = {
  reading: "var(--c-accent)",
  future: "var(--c-warn)",
  read: "var(--c-ok)",
  abandoned: "var(--c-danger)",
};

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

// Control de concurrencia optimista (mismo patrón que Coches/portfolio_state
// — ver lib/section-persist.ts): en conflicto se pide una recarga completa
// en vez de perder la edición más reciente en silencio.
async function saveLectura(
  books: Book[],
  yearlyGoal: string,
  covers: Record<string, string>,
  versions: LecturaVersions,
  setStatus: (s: SaveStatus) => void
): Promise<{ versions: LecturaVersions; conflicted: boolean }> {
  setStatus("saving");
  const nextVersions = { ...versions };
  let conflicted = false;
  let ok = true;

  for (let i = 0; i < 2; i++) {
    const r = await putSection("lectura", { books, yearlyGoal }, versions.lectura, parseLecturaState);
    if (r.kind === "ok") { nextVersions.lectura = r.version; break; }
    if (r.kind === "conflict") { conflicted = true; ok = false; break; }
    ok = false;
  }
  if (!conflicted) {
    for (let i = 0; i < 2; i++) {
      const r = await putSection("lectura-covers", covers, versions.lecturaCovers, parseBookCovers);
      if (r.kind === "ok") { nextVersions.lecturaCovers = r.version; ok = true; break; }
      if (r.kind === "conflict") { conflicted = true; ok = false; break; }
      ok = false;
    }
  }

  setStatus(conflicted ? "conflict" : ok ? "saved" : "error");
  return { versions: nextVersions, conflicted };
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

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ height: 6, borderRadius: 3, background: "var(--c-surface)", overflow: "hidden", marginTop: "0.3rem" }}>
      <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 3, transition: "width 0.2s" }} />
    </div>
  );
}

function StatusBadge({ status }: { status: BookStatus }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "0.15rem 0.5rem",
        borderRadius: 999,
        fontSize: "0.72rem",
        fontWeight: 600,
        color: "#ffffff",
        background: STATUS_COLOR[status],
      }}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

function Stars({ rating, onRate }: { rating: number; onRate?: (n: number) => void }) {
  return (
    <div style={{ fontSize: "1.1rem", letterSpacing: "0.1rem", color: "var(--c-warn)" }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          onClick={onRate ? () => onRate(n === rating ? 0 : n) : undefined}
          style={{ cursor: onRate ? "pointer" : "default" }}
        >
          {n <= rating ? "★" : "☆"}
        </span>
      ))}
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ minWidth: "6rem" }}>
      <p style={{ fontSize: "1.3rem", fontWeight: 700, color: "var(--c-text)", margin: 0 }}>{value}</p>
      <p style={{ fontSize: "0.76rem", color: "var(--c-muted)", margin: "0.15rem 0 0" }}>{label}</p>
    </div>
  );
}

function AddBookForm({ onAdd }: { onAdd: (title: string, author: string, pagesTotal: string) => void }) {
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [pages, setPages] = useState("");

  const submit = () => {
    const t = title.trim();
    if (!t) return;
    onAdd(t, author.trim(), pages.trim());
    setTitle("");
    setAuthor("");
    setPages("");
  };
  const onEnter = (e: React.KeyboardEvent) => { if (e.key === "Enter") submit(); };

  return (
    <section style={cardStyle}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "flex-end" }}>
        <label style={{ flex: "3 1 14rem" }}>
          <span style={{ display: "block", fontSize: "0.72rem", color: "var(--c-muted)", marginBottom: "0.25rem" }}>Título del libro</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Escribe el título…"
            style={{ ...inputStyle, width: "100%" }}
            onKeyDown={onEnter}
          />
        </label>
        <label style={{ flex: "2 1 10rem" }}>
          <span style={{ display: "block", fontSize: "0.72rem", color: "var(--c-muted)", marginBottom: "0.25rem" }}>Autor</span>
          <input
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="Autor"
            style={{ ...inputStyle, width: "100%" }}
            onKeyDown={onEnter}
          />
        </label>
        <label style={{ width: "6rem" }}>
          <span style={{ display: "block", fontSize: "0.72rem", color: "var(--c-muted)", marginBottom: "0.25rem" }}>Págs</span>
          <input
            value={pages}
            onChange={(e) => { if (/^\d{0,5}$/.test(e.target.value)) setPages(e.target.value); }}
            placeholder="0"
            style={{ ...inputStyle, width: "100%" }}
            onKeyDown={onEnter}
          />
        </label>
        <button type="button" onClick={submit} style={{ ...btnAccent, padding: "0.55rem 1.1rem" }}>+ Añadir</button>
      </div>
    </section>
  );
}

function YearlyGoal({ goal, done, onChange }: { goal: string; done: number; onChange: (v: string) => void }) {
  const n = Number.parseInt(goal, 10) || 0;
  const pct = n > 0 ? Math.min(100, Math.round((done / n) * 100)) : 0;
  const bump = (delta: number) => onChange(String(Math.max(0, n + delta)));

  return (
    <section style={cardStyle}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.6rem" }}>
        <h2 style={{ fontSize: "0.95rem", margin: 0, color: "var(--c-text)" }}>🎯 Meta anual de libros</h2>
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
          <button type="button" onClick={() => bump(-1)} style={{ ...btnStyle, padding: "0.2rem 0.6rem" }} aria-label="Bajar meta">−</button>
          <span style={{ fontWeight: 700, color: "var(--c-accent)", minWidth: "1.3rem", textAlign: "center" }}>{n}</span>
          <button type="button" onClick={() => bump(1)} style={{ ...btnStyle, padding: "0.2rem 0.6rem" }} aria-label="Subir meta">+</button>
        </div>
      </div>
      {n > 0 ? (
        <>
          <ProgressBar pct={pct} color="var(--c-accent)" />
          <p style={{ fontSize: "0.76rem", color: "var(--c-muted)", margin: "0.35rem 0 0", textAlign: "right" }}>
            {done} / {n} libros ({pct}%)
          </p>
        </>
      ) : (
        <p style={{ fontSize: "0.8rem", color: "var(--c-muted)", margin: 0 }}>Fija una meta con el +.</p>
      )}
    </section>
  );
}

export default function LecturaManager() {
  const [books, setBooks] = useState<Book[] | null>(null);
  const [yearlyGoal, setYearlyGoal] = useState("");
  const [covers, setCovers] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [fetchingCovers, setFetchingCovers] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<FilterValue>("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const skipOnce = useRef(true);
  const pendingRef = useRef<{ books: Book[]; yearlyGoal: string; covers: Record<string, string> } | null>(null);
  const versionsRef = useRef<LecturaVersions>({ lectura: null, lecturaCovers: null });

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
        const booksData = (await booksRes.json()) as { data?: unknown; version?: number | null };
        const coversData = coversRes.ok
          ? ((await coversRes.json()) as { data?: unknown; version?: number | null })
          : { data: {}, version: null };
        if (!cancelled) {
          const parsed = parseLecturaState(booksData.data);
          setBooks(parsed.books);
          setYearlyGoal(parsed.yearlyGoal);
          setCovers(parseBookCovers(coversData.data));
          versionsRef.current = { lectura: booksData.version ?? null, lecturaCovers: coversData.version ?? null };
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
    pendingRef.current = { books, yearlyGoal, covers };
    const timer = setTimeout(() => {
      (async () => {
        const result = await saveLectura(books, yearlyGoal, covers, versionsRef.current, setSaveStatus);
        versionsRef.current = result.versions;
        if (result.conflicted) {
          skipOnce.current = true;
          setBooks(null);
          setReloadKey((k) => k + 1);
        }
      })();
    }, 500);
    return () => clearTimeout(timer);
  }, [books, yearlyGoal, covers, loadError]);

  // --- Flush on unload, igual que Coches ---
  useEffect(() => {
    const flush = () => {
      const p = pendingRef.current;
      if (!p) return;
      try {
        fetch("/api/section/lectura", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ books: p.books, yearlyGoal: p.yearlyGoal, expectedVersion: versionsRef.current.lectura }),
          keepalive: true,
        });
        fetch("/api/section/lectura-covers", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...p.covers, expectedVersion: versionsRef.current.lecturaCovers }),
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

  const fetchCover = async (id: string, params: { title?: string; author?: string; url?: string }) => {
    setFetchingCovers((s) => new Set(s).add(id));
    try {
      const q = new URLSearchParams();
      if (params.url) q.set("url", params.url);
      if (params.title) q.set("title", params.title);
      if (params.author) q.set("author", params.author);
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

  const addBook = (title: string, author: string, pagesTotal: string) => {
    const id = uid();
    const book: Book = {
      id, title, author, pagesTotal,
      status: "future", yearFinished: "", pagesRead: "", rating: 0, notes: "", coverUrl: "",
    };
    setBooks((prev) => [...(prev ?? []), book]);
    void fetchCover(id, { title, author });
  };

  const updateBook = (id: string, patch: Partial<Book>) => {
    setBooks((prev) => (prev ?? []).map((b) => (b.id === id ? { ...b, ...patch } : b)));
  };

  const deleteBook = (id: string) => {
    setBooks((prev) => (prev ?? []).filter((b) => b.id !== id));
    setCovers((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (editingId === id) setEditingId(null);
  };

  const moveFuture = (id: string, direction: "up" | "down") => {
    setBooks((prev) => (prev ? moveFutureBook(prev, id, direction) : prev));
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

  const stats = computeReadingStats(books);
  const editingBook = books.find((b) => b.id === editingId) ?? null;
  const future = books.filter((b) => b.status === "future");
  const dateLabel = new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date());

  const counts: Record<FilterValue, number> = {
    all: books.length,
    reading: stats.currentlyReading,
    future: stats.upcoming,
    read: stats.totalRead,
    abandoned: stats.abandoned,
  };
  const FILTER_LABEL: Record<FilterValue, string> = {
    all: "Todos", reading: "Leyendo", future: "Pendientes", read: "Terminados", abandoned: "Abandonados",
  };

  return (
    <div className={c.page}>
      <div style={{ display: "flex", alignItems: "baseline", gap: "0.6rem", marginBottom: "0.25rem", flexWrap: "wrap" }}>
        <h1 style={{ fontSize: "1.3rem", margin: 0, color: "var(--c-text)" }}>Lectura</h1>
        <span style={{ fontSize: "0.85rem", color: "var(--c-muted)" }}>Seguimiento de libros</span>
        {saveStatus !== "idle" && (
          <span
            role="status"
            style={{ color: saveStatus === "error" ? "var(--c-danger)" : "var(--c-ok)", fontSize: "0.8rem" }}
          >
            {saveStatus === "saving"
              ? "Guardando…"
              : saveStatus === "saved"
                ? "Guardado"
                : saveStatus === "conflict"
                  ? "Actualizado desde otra pestaña — recargando"
                  : "Error al guardar"}
          </span>
        )}
      </div>
      <p style={{ fontSize: "0.8rem", color: "var(--c-muted)", margin: "0 0 1rem", textTransform: "capitalize" }}>{dateLabel}</p>

      <AddBookForm onAdd={addBook} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        <YearlyGoal goal={yearlyGoal} done={stats.readThisYear} onChange={setYearlyGoal} />
        <section style={cardStyle}>
          <h2 style={{ fontSize: "0.95rem", margin: "0 0 0.75rem", color: "var(--c-text)" }}>📊 Estadísticas</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "1.25rem" }}>
            <StatTile label="Leídos" value={String(stats.totalRead)} />
            <StatTile label="Leyendo" value={String(stats.currentlyReading)} />
            <StatTile label="Páginas" value={stats.totalPages.toLocaleString("es-ES")} />
            <StatTile label="Valoración" value={stats.avgRating > 0 ? stats.avgRating.toFixed(1) : "—"} />
          </div>
        </section>
      </div>

      {/* Filtros */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", margin: "0.25rem 0 1rem" }}>
        {(["all", "reading", "read", "future", "abandoned"] as FilterValue[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            style={{
              ...btnStyle,
              background: filter === f ? "var(--c-accent)" : "var(--c-btn)",
              color: filter === f ? "#ffffff" : "var(--c-btn-text)",
              fontWeight: 600,
            }}
          >
            {FILTER_LABEL[f]} ({counts[f]})
          </button>
        ))}
      </div>

      {books.length === 0 && (
        <p style={{ color: "var(--c-muted)", fontSize: "0.85rem" }}>Añade tu primer libro arriba para empezar.</p>
      )}

      {STATUS_ORDER.filter((status) => filter === "all" || filter === status).map((status) => {
        const group = books.filter((b) => b.status === status);
        if (group.length === 0) return null;
        return (
          <section key={status} style={{ marginBottom: "1.25rem" }}>
            <h2 style={{ fontSize: "0.9rem", margin: "0 0 0.6rem", color: STATUS_COLOR[status] }}>
              {STATUS_LABEL[status]} <span style={{ color: "var(--c-muted)", fontWeight: 400 }}>· {group.length} libro{group.length === 1 ? "" : "s"}</span>
            </h2>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.9rem" }}>
              {group.map((b) => {
                const pct = Math.round(bookProgress(b));
                const pagesTotal = Number.parseFloat(b.pagesTotal) || 0;
                const pagesRead = Number.parseFloat(b.pagesRead) || 0;
                const queuePos = status === "future" ? future.findIndex((f) => f.id === b.id) : -1;
                return (
                  <div key={b.id} style={{ width: "11rem", position: "relative" }}>
                    {queuePos >= 0 && (
                      <span
                        style={{
                          position: "absolute", top: -6, left: -6, width: 22, height: 22, borderRadius: "50%",
                          background: "var(--c-warn)", color: "#fff", fontSize: "0.72rem", fontWeight: 700,
                          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1,
                        }}
                      >
                        {queuePos + 1}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setEditingId(b.id)}
                      style={{ all: "unset", cursor: "pointer", display: "block", width: "100%" }}
                    >
                      <CoverThumb src={covers[b.id]} title={b.title} width={176} height={240} />
                      <p style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--c-text)", margin: "0.4rem 0 0" }}>{b.title}</p>
                      {b.author && <p style={{ fontSize: "0.76rem", color: "var(--c-muted)", margin: "0.1rem 0 0" }}>{b.author}</p>}
                      <div style={{ marginTop: "0.3rem" }}><StatusBadge status={b.status} /></div>
                      <ProgressBar pct={status === "read" ? 100 : pct} color={STATUS_COLOR[status]} />
                      <p style={{ fontSize: "0.72rem", color: "var(--c-muted)", margin: "0.25rem 0 0" }}>
                        {pagesRead} / {pagesTotal || "?"} págs · {status === "read" ? 100 : pct}%
                      </p>
                      {status === "read" && b.rating > 0 && <Stars rating={b.rating} />}
                    </button>
                    {status === "future" && (
                      <div style={{ display: "flex", gap: "0.3rem", marginTop: "0.3rem" }}>
                        <button type="button" onClick={() => moveFuture(b.id, "up")} disabled={queuePos === 0} style={{ ...btnStyle, padding: "0.15rem 0.45rem", fontSize: "0.75rem" }} aria-label={`Subir ${b.title}`}>▲</button>
                        <button type="button" onClick={() => moveFuture(b.id, "down")} disabled={queuePos === future.length - 1} style={{ ...btnStyle, padding: "0.15rem 0.45rem", fontSize: "0.75rem" }} aria-label={`Bajar ${b.title}`}>▼</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      {editingBook && (
        <EditPanel
          book={editingBook}
          cover={covers[editingBook.id]}
          fetchingCover={fetchingCovers.has(editingBook.id)}
          onClose={() => setEditingId(null)}
          onChange={(patch) => updateBook(editingBook.id, patch)}
          onSearchCover={() => void fetchCover(editingBook.id, { title: editingBook.title, author: editingBook.author })}
          onFetchCoverUrl={(url) => void fetchCover(editingBook.id, { url })}
          onDelete={() => deleteBook(editingBook.id)}
        />
      )}
    </div>
  );
}

function EditPanel({
  book,
  cover,
  fetchingCover,
  onClose,
  onChange,
  onSearchCover,
  onFetchCoverUrl,
  onDelete,
}: {
  book: Book;
  cover: string | undefined;
  fetchingCover: boolean;
  onClose: () => void;
  onChange: (patch: Partial<Book>) => void;
  onSearchCover: () => void;
  onFetchCoverUrl: (url: string) => void;
  onDelete: () => void;
}) {
  const pct = Math.round(bookProgress(book));
  const pagesTotal = Number.parseFloat(book.pagesTotal) || 0;
  const pagesRead = Number.parseFloat(book.pagesRead) || 0;

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 40 }}
      />
      <div
        style={{
          position: "fixed", top: 0, right: 0, bottom: 0, width: "min(22rem, 100vw)",
          background: "var(--c-card)", borderLeft: "1px solid var(--c-border)", zIndex: 41,
          overflowY: "auto", padding: "1.25rem",
        }}
      >
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
          <CoverThumb src={cover} title={book.title} width={56} height={80} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontWeight: 700, color: "var(--c-text)", margin: 0 }}>{book.title}</p>
            {book.author && <p style={{ fontSize: "0.8rem", color: "var(--c-muted)", margin: "0.1rem 0 0" }}>{book.author}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" style={{ ...btnStyle, padding: "0.2rem 0.5rem" }}>×</button>
        </div>

        <div style={{ margin: "0.6rem 0" }}><StatusBadge status={book.status} /></div>
        <ProgressBar pct={book.status === "read" ? 100 : pct} color={STATUS_COLOR[book.status]} />
        <p style={{ fontSize: "0.76rem", color: "var(--c-muted)", margin: "0.3rem 0 1rem" }}>
          {pagesRead} / {pagesTotal || "?"} págs · {book.status === "read" ? 100 : pct}%
        </p>

        <Field label="Portada (URL)">
          <div style={{ display: "flex", gap: "0.4rem" }}>
            <input
              value={book.coverUrl}
              onChange={(e) => onChange({ coverUrl: e.target.value })}
              placeholder="https://…"
              style={{ ...inputStyle, flex: 1 }}
            />
            <button
              type="button"
              onClick={() => book.coverUrl.trim() && onFetchCoverUrl(book.coverUrl.trim())}
              disabled={fetchingCover || !book.coverUrl.trim()}
              style={{ ...btnAccent, padding: "0.4rem 0.6rem" }}
              title="Descargar esa URL"
            >
              ✓
            </button>
            <button
              type="button"
              onClick={onSearchCover}
              disabled={fetchingCover}
              style={{ ...btnStyle, padding: "0.4rem 0.6rem" }}
              title="Buscar portada automáticamente"
            >
              {fetchingCover ? "…" : "🔍"}
            </button>
          </div>
        </Field>

        <div style={{ display: "flex", gap: "0.6rem" }}>
          <Field label="Páginas leídas" style={{ flex: 1 }}>
            <input
              value={book.pagesRead}
              onChange={(e) => { if (/^\d{0,5}$/.test(e.target.value)) onChange({ pagesRead: e.target.value }); }}
              style={{ ...inputStyle, width: "100%" }}
            />
          </Field>
          <Field label="Páginas totales" style={{ flex: 1 }}>
            <input
              value={book.pagesTotal}
              onChange={(e) => { if (/^\d{0,5}$/.test(e.target.value)) onChange({ pagesTotal: e.target.value }); }}
              style={{ ...inputStyle, width: "100%" }}
            />
          </Field>
        </div>

        <Field label="Año de finalización">
          <input
            value={book.yearFinished}
            onChange={(e) => { if (/^\d{0,4}$/.test(e.target.value)) onChange({ yearFinished: e.target.value }); }}
            placeholder={String(new Date().getFullYear())}
            style={{ ...inputStyle, width: "100%" }}
          />
        </Field>

        <Field label="Valoración">
          <Stars rating={book.rating} onRate={(n) => onChange({ rating: n })} />
        </Field>

        <Field label="Estado">
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
            {STATUS_ORDER.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onChange({ status: s, yearFinished: s === "read" && !book.yearFinished ? String(new Date().getFullYear()) : book.yearFinished })}
                style={{
                  ...btnStyle,
                  background: book.status === s ? STATUS_COLOR[s] : "var(--c-btn)",
                  color: book.status === s ? "#ffffff" : "var(--c-btn-text)",
                  fontWeight: 600,
                }}
              >
                {STATUS_LABEL[s]}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Notas">
          <textarea
            value={book.notes}
            onChange={(e) => onChange({ notes: e.target.value })}
            placeholder="Tus anotaciones sobre el libro…"
            rows={4}
            style={{ ...inputStyle, width: "100%", resize: "vertical", fontFamily: "inherit" }}
          />
        </Field>

        <button
          type="button"
          onClick={onDelete}
          style={{ ...btnDanger, width: "100%", padding: "0.6rem", background: "rgba(239, 68, 68, 0.1)", marginTop: "0.5rem" }}
        >
          🗑 Eliminar
        </button>
      </div>
    </>
  );
}

function Field({ label, children, style }: { label: string; children: React.ReactNode; style?: CSSProperties }) {
  return (
    <label style={{ display: "block", margin: "0.9rem 0", ...style }}>
      <span style={{ display: "block", fontSize: "0.72rem", fontWeight: 600, color: "var(--c-muted)", marginBottom: "0.3rem", textTransform: "uppercase" }}>
        {label}
      </span>
      {children}
    </label>
  );
}
