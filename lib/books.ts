export type BookStatus = "reading" | "future" | "read";

export type Book = {
  id: string;
  title: string;
  author: string;
  status: BookStatus;
  /** Año en que se terminó, solo relevante si status === "read". */
  yearFinished: string;
};

export type LecturaState = {
  books: Book[];
};

const BOOK_STATUSES: BookStatus[] = ["reading", "future", "read"];

export function parseBooks(raw: unknown): Book[] {
  if (!Array.isArray(raw)) return [];
  const out: Book[] = [];
  for (const item of raw) {
    if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      if (typeof o.id === "string" && typeof o.title === "string") {
        out.push({
          id: o.id,
          title: o.title,
          author: typeof o.author === "string" ? o.author : "",
          status: BOOK_STATUSES.includes(o.status as BookStatus) ? (o.status as BookStatus) : "future",
          yearFinished: typeof o.yearFinished === "string" ? o.yearFinished : "",
        });
      }
    }
  }
  return out;
}

export function parseLecturaState(raw: unknown): LecturaState {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { books: [] };
  const o = raw as Record<string, unknown>;
  return { books: parseBooks(o.books) };
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

export type ReadYearGroup = { year: string; books: Book[] };

/** Agrupa los libros leídos por año (más reciente primero); los que no
 * tienen año anotado caen en un grupo "Sin año" al final. */
export function groupReadBooksByYear(books: Book[]): ReadYearGroup[] {
  const byYear = new Map<string, Book[]>();
  for (const b of books) {
    if (b.status !== "read") continue;
    const key = b.yearFinished.trim() || "Sin año";
    if (!byYear.has(key)) byYear.set(key, []);
    byYear.get(key)!.push(b);
  }
  const years = Array.from(byYear.keys()).sort((a, b) => {
    if (a === "Sin año") return 1;
    if (b === "Sin año") return -1;
    return b.localeCompare(a);
  });
  return years.map((year) => ({ year, books: byYear.get(year)! }));
}

export type ReadingStats = {
  totalRead: number;
  readThisYear: number;
  /** Años distintos con al menos un libro leído (los "Sin año" no cuentan). */
  yearsActive: number;
  avgPerYear: number;
  currentlyReading: number;
  upcoming: number;
};

export function computeReadingStats(books: Book[], today: Date = new Date()): ReadingStats {
  const read = books.filter((b) => b.status === "read");
  const currentYear = String(today.getFullYear());
  const years = new Set(read.map((b) => b.yearFinished.trim()).filter(Boolean));
  const yearsActive = years.size;
  return {
    totalRead: read.length,
    readThisYear: read.filter((b) => b.yearFinished.trim() === currentYear).length,
    yearsActive,
    avgPerYear: yearsActive > 0 ? read.length / yearsActive : 0,
    currentlyReading: books.filter((b) => b.status === "reading").length,
    upcoming: books.filter((b) => b.status === "future").length,
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
