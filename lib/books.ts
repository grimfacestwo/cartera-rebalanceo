export type BookStatus = "reading" | "future" | "read" | "abandoned";

export type Book = {
  id: string;
  title: string;
  author: string;
  status: BookStatus;
  /** Año en que se terminó, solo relevante si status === "read". */
  yearFinished: string;
  pagesTotal: string;
  pagesRead: string;
  /** 0 = sin valorar, 1-5 estrellas. */
  rating: number;
  notes: string;
  /** URL de portada pegada a mano (independiente de la imagen ya descargada
   * en "lectura-covers"), para poder mostrarla de nuevo al reabrir el libro. */
  coverUrl: string;
};

export type LecturaState = {
  books: Book[];
  /** Meta anual de libros terminados, como texto para el mismo patrón de
   * inputs numéricos del resto de la app ("" = sin meta fijada). */
  yearlyGoal: string;
};

const BOOK_STATUSES: BookStatus[] = ["reading", "future", "read", "abandoned"];

export function parseBooks(raw: unknown): Book[] {
  if (!Array.isArray(raw)) return [];
  const out: Book[] = [];
  for (const item of raw) {
    if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      if (typeof o.id === "string" && typeof o.title === "string") {
        const rating = typeof o.rating === "number" && Number.isFinite(o.rating) ? o.rating : 0;
        out.push({
          id: o.id,
          title: o.title,
          author: typeof o.author === "string" ? o.author : "",
          status: BOOK_STATUSES.includes(o.status as BookStatus) ? (o.status as BookStatus) : "future",
          yearFinished: typeof o.yearFinished === "string" ? o.yearFinished : "",
          pagesTotal: typeof o.pagesTotal === "string" ? o.pagesTotal : "",
          pagesRead: typeof o.pagesRead === "string" ? o.pagesRead : "",
          rating: Math.min(5, Math.max(0, Math.round(rating))),
          notes: typeof o.notes === "string" ? o.notes : "",
          coverUrl: typeof o.coverUrl === "string" ? o.coverUrl : "",
        });
      }
    }
  }
  return out;
}

export function parseLecturaState(raw: unknown): LecturaState {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { books: [], yearlyGoal: "" };
  const o = raw as Record<string, unknown>;
  return {
    books: parseBooks(o.books),
    yearlyGoal: typeof o.yearlyGoal === "string" ? o.yearlyGoal : "",
  };
}

/** Portadas: guardadas aparte (sección "lectura-covers"), igual que coches
 * separa "coches-docs" de "coches" — evita releer/reescribir varios MB de
 * imágenes en base64 cada vez que solo cambia el orden o el título. */
export function parseBookCovers(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

export function bookProgress(book: Book): number {
  const total = Number.parseFloat(book.pagesTotal);
  const read = Number.parseFloat(book.pagesRead);
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(read)) return 0;
  return Math.min(100, Math.max(0, (read / total) * 100));
}

export type ReadingStats = {
  totalRead: number;
  readThisYear: number;
  currentlyReading: number;
  upcoming: number;
  abandoned: number;
  /** Suma de páginas leídas (pagesRead) de todos los libros, leídos o en curso. */
  totalPages: number;
  /** Media de valoración entre los libros que tienen alguna (rating > 0). */
  avgRating: number;
};

export function computeReadingStats(books: Book[], today: Date = new Date()): ReadingStats {
  const read = books.filter((b) => b.status === "read");
  const currentYear = String(today.getFullYear());
  const rated = books.filter((b) => b.rating > 0);
  return {
    totalRead: read.length,
    readThisYear: read.filter((b) => b.yearFinished.trim() === currentYear).length,
    currentlyReading: books.filter((b) => b.status === "reading").length,
    upcoming: books.filter((b) => b.status === "future").length,
    abandoned: books.filter((b) => b.status === "abandoned").length,
    totalPages: books.reduce((s, b) => s + (Number.parseFloat(b.pagesRead) || 0), 0),
    avgRating: rated.length > 0 ? rated.reduce((s, b) => s + b.rating, 0) / rated.length : 0,
  };
}

/**
 * Mueve un libro de "próximas lecturas" un puesto arriba/abajo respecto a
 * los demás libros futuros, preservando su posición relativa con el resto
 * (en lectura/leídos) del array. Devuelve el mismo array si no hay
 * movimiento posible (ya está en el extremo, o no se encuentra el id).
 */
export function moveFutureBook(books: Book[], id: string, direction: "up" | "down"): Book[] {
  const futureIdx = books.reduce<number[]>((acc, b, i) => {
    if (b.status === "future") acc.push(i);
    return acc;
  }, []);
  const pos = futureIdx.findIndex((i) => books[i].id === id);
  if (pos === -1) return books;
  const swapWith = direction === "up" ? pos - 1 : pos + 1;
  if (swapWith < 0 || swapWith >= futureIdx.length) return books;
  const i = futureIdx[pos];
  const j = futureIdx[swapWith];
  const next = [...books];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}
