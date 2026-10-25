import { describe, expect, it } from "vitest";
import { computeReadingStats, groupReadBooksByYear, moveFutureBook, parseBookCovers, parseBooks, parseLecturaState, type Book } from "./books";

function book(overrides: Partial<Book>): Book {
  return { id: "b1", title: "Libro", author: "", status: "future", yearFinished: "", ...overrides };
}

describe("parseBooks", () => {
  it("descarta entradas sin id o sin title", () => {
    expect(parseBooks([{ title: "X" }, { id: "1" }, "mal", null])).toEqual([]);
  });

  it("rellena campos opcionales con sus valores por defecto", () => {
    expect(parseBooks([{ id: "1", title: "Dune" }])).toEqual([
      { id: "1", title: "Dune", author: "", status: "future", yearFinished: "" },
    ]);
  });

  it("descarta un status desconocido y usa 'future'", () => {
    expect(parseBooks([{ id: "1", title: "Dune", status: "leyendo-mal" }])[0].status).toBe("future");
  });

  it("acepta los tres status válidos", () => {
    const raw = [
      { id: "1", title: "A", status: "reading" },
      { id: "2", title: "B", status: "future" },
      { id: "3", title: "C", status: "read" },
    ];
    expect(parseBooks(raw).map((b) => b.status)).toEqual(["reading", "future", "read"]);
  });
});

describe("parseLecturaState", () => {
  it("devuelve books vacío si raw no es un objeto válido", () => {
    expect(parseLecturaState(null)).toEqual({ books: [] });
    expect(parseLecturaState("mal")).toEqual({ books: [] });
    expect(parseLecturaState([])).toEqual({ books: [] });
  });

  it("parsea el array books anidado", () => {
    expect(parseLecturaState({ books: [{ id: "1", title: "Dune" }] }).books).toHaveLength(1);
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

describe("groupReadBooksByYear", () => {
  it("agrupa solo los libros con status 'read', por año, más reciente primero", () => {
    const books = [
      book({ id: "1", status: "read", yearFinished: "2024" }),
      book({ id: "2", status: "read", yearFinished: "2026" }),
      book({ id: "3", status: "read", yearFinished: "2024" }),
      book({ id: "4", status: "reading" }),
      book({ id: "5", status: "future" }),
    ];
    const groups = groupReadBooksByYear(books);
    expect(groups.map((g) => g.year)).toEqual(["2026", "2024"]);
    expect(groups.find((g) => g.year === "2024")!.books.map((b) => b.id)).toEqual(["1", "3"]);
  });

  it("deja los libros sin año anotado en un grupo 'Sin año' al final", () => {
    const books = [
      book({ id: "1", status: "read", yearFinished: "2026" }),
      book({ id: "2", status: "read", yearFinished: "" }),
    ];
    const groups = groupReadBooksByYear(books);
    expect(groups.map((g) => g.year)).toEqual(["2026", "Sin año"]);
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

  it("cuenta leídos totales, de este año, y la media por año activo", () => {
    const books = [
      book({ id: "1", status: "read", yearFinished: "2026" }),
      book({ id: "2", status: "read", yearFinished: "2026" }),
      book({ id: "3", status: "read", yearFinished: "2024" }),
      book({ id: "4", status: "reading" }),
      book({ id: "5", status: "future" }),
      book({ id: "6", status: "future" }),
    ];
    const stats = computeReadingStats(books, today);
    expect(stats).toEqual({
      totalRead: 3,
      readThisYear: 2,
      yearsActive: 2,
      avgPerYear: 1.5,
      currentlyReading: 1,
      upcoming: 2,
    });
  });

  it("no cuenta los 'Sin año' como año activo, pero sí suman al total", () => {
    const books = [book({ id: "1", status: "read", yearFinished: "" })];
    const stats = computeReadingStats(books, today);
    expect(stats.totalRead).toBe(1);
    expect(stats.yearsActive).toBe(0);
    expect(stats.avgPerYear).toBe(0);
  });

  it("con cero libros devuelve todo a cero sin dividir por cero", () => {
    expect(computeReadingStats([], today)).toEqual({
      totalRead: 0,
      readThisYear: 0,
      yearsActive: 0,
      avgPerYear: 0,
      currentlyReading: 0,
      upcoming: 0,
    });
  });
});
