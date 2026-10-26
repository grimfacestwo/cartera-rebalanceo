import { describe, expect, it } from "vitest";
import { bookProgress, computeReadingStats, moveFutureBook, parseBookCovers, parseBooks, parseLecturaState, type Book } from "./books";

function book(overrides: Partial<Book>): Book {
  return {
    id: "b1",
    title: "Libro",
    author: "",
    status: "future",
    yearFinished: "",
    pagesTotal: "",
    pagesRead: "",
    rating: 0,
    notes: "",
    coverUrl: "",
    ...overrides,
  };
}

describe("parseBooks", () => {
  it("descarta entradas sin id o sin title", () => {
    expect(parseBooks([{ title: "X" }, { id: "1" }, "mal", null])).toEqual([]);
  });

  it("rellena campos opcionales con sus valores por defecto", () => {
    expect(parseBooks([{ id: "1", title: "Dune" }])).toEqual([
      {
        id: "1",
        title: "Dune",
        author: "",
        status: "future",
        yearFinished: "",
        pagesTotal: "",
        pagesRead: "",
        rating: 0,
        notes: "",
        coverUrl: "",
      },
    ]);
  });

  it("descarta un status desconocido y usa 'future'", () => {
    expect(parseBooks([{ id: "1", title: "Dune", status: "leyendo-mal" }])[0].status).toBe("future");
  });

  it("acepta los cuatro status válidos, incluido 'abandoned'", () => {
    const raw = [
      { id: "1", title: "A", status: "reading" },
      { id: "2", title: "B", status: "future" },
      { id: "3", title: "C", status: "read" },
      { id: "4", title: "D", status: "abandoned" },
    ];
    expect(parseBooks(raw).map((b) => b.status)).toEqual(["reading", "future", "read", "abandoned"]);
  });

  it("recorta la valoración a 0-5 y redondea", () => {
    expect(parseBooks([{ id: "1", title: "A", rating: 7.6 }])[0].rating).toBe(5);
    expect(parseBooks([{ id: "1", title: "A", rating: -3 }])[0].rating).toBe(0);
    expect(parseBooks([{ id: "1", title: "A", rating: 3.4 }])[0].rating).toBe(3);
  });
});

describe("parseLecturaState", () => {
  it("devuelve valores por defecto si raw no es un objeto válido", () => {
    expect(parseLecturaState(null)).toEqual({ books: [], yearlyGoal: "" });
    expect(parseLecturaState("mal")).toEqual({ books: [], yearlyGoal: "" });
    expect(parseLecturaState([])).toEqual({ books: [], yearlyGoal: "" });
  });

  it("parsea el array books anidado y yearlyGoal", () => {
    const state = parseLecturaState({ books: [{ id: "1", title: "Dune" }], yearlyGoal: "12" });
    expect(state.books).toHaveLength(1);
    expect(state.yearlyGoal).toBe("12");
  });
});

describe("parseBookCovers", () => {
  it("descarta claves cuyo valor no es string", () => {
    expect(parseBookCovers({ a: "data:x", b: 5, c: null })).toEqual({ a: "data:x" });
  });

  it("devuelve {} si raw no es un objeto válido", () => {
    expect(parseBookCovers(null)).toEqual({});
    expect(parseBookCovers([])).toEqual({});
  });
});

describe("bookProgress", () => {
  it("calcula el porcentaje de páginas leídas", () => {
    expect(bookProgress(book({ pagesTotal: "200", pagesRead: "50" }))).toBe(25);
  });

  it("devuelve 0 si faltan páginas totales o son inválidas", () => {
    expect(bookProgress(book({ pagesTotal: "", pagesRead: "50" }))).toBe(0);
    expect(bookProgress(book({ pagesTotal: "0", pagesRead: "50" }))).toBe(0);
  });

  it("no supera el 100% aunque pagesRead sea mayor que pagesTotal", () => {
    expect(bookProgress(book({ pagesTotal: "100", pagesRead: "150" }))).toBe(100);
  });
});

describe("moveFutureBook", () => {
  it("intercambia un libro futuro con el futuro anterior, ignorando libros de otro status de por medio", () => {
    const books = [
      book({ id: "a", status: "future" }),
      book({ id: "x", status: "reading" }),
      book({ id: "b", status: "future" }),
    ];
    const next = moveFutureBook(books, "b", "up");
    expect(next.map((b) => b.id)).toEqual(["b", "x", "a"]);
  });

  it("no mueve nada si ya está en el extremo", () => {
    const books = [book({ id: "a", status: "future" }), book({ id: "b", status: "future" })];
    expect(moveFutureBook(books, "a", "up")).toBe(books);
    expect(moveFutureBook(books, "b", "down")).toBe(books);
  });

  it("no hace nada si el id no existe o no es 'future'", () => {
    const books = [book({ id: "a", status: "future" }), book({ id: "b", status: "reading" })];
    expect(moveFutureBook(books, "b", "up")).toBe(books);
    expect(moveFutureBook(books, "no-existe", "up")).toBe(books);
  });
});

describe("computeReadingStats", () => {
  const today = new Date("2026-06-15T00:00:00");

  it("cuenta leídos totales, de este año, páginas y valoración media", () => {
    const books = [
      book({ id: "1", status: "read", yearFinished: "2026", pagesRead: "300", rating: 4 }),
      book({ id: "2", status: "read", yearFinished: "2026", pagesRead: "200", rating: 2 }),
      book({ id: "3", status: "read", yearFinished: "2024", pagesRead: "100" }),
      book({ id: "4", status: "reading", pagesRead: "50" }),
      book({ id: "5", status: "future" }),
      book({ id: "6", status: "future" }),
      book({ id: "7", status: "abandoned" }),
    ];
    const stats = computeReadingStats(books, today);
    expect(stats).toEqual({
      totalRead: 3,
      readThisYear: 2,
      currentlyReading: 1,
      upcoming: 2,
      abandoned: 1,
      totalPages: 650,
      avgRating: 3,
    });
  });

  it("con cero libros devuelve todo a cero sin dividir por cero", () => {
    expect(computeReadingStats([], today)).toEqual({
      totalRead: 0,
      readThisYear: 0,
      currentlyReading: 0,
      upcoming: 0,
      abandoned: 0,
      totalPages: 0,
      avgRating: 0,
    });
  });
});
