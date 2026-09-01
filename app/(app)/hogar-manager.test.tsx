import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import HogarManager from "./hogar-manager";
import { currentMonthKey, type PortfolioState } from "@/lib/state";

vi.mock("./hogar.module.css", () => ({
  default: new Proxy(
    {},
    {
      get: (_target, prop: string) => prop,
    },
  ),
}));

function buildMockState(): PortfolioState {
  return {
    assets: [],
    values: {},
    contribution: "",
    months: {
      [currentMonthKey()]: {
        banks: { ing: "1000", santander: "0", trade: "0" },
        expenses: [
          { id: "e1", name: "Comida", amount: "250", type: "variable", bank: "ing", paid: false, category: "gastos", recurring: false },
        ],
        fixed: [],
      },
    },
    goals: [],
    // No vacío: un array vacío hace que parseState() rellene la plantilla
    // con DEFAULT_FIXED_EXPENSES (gastos fijos reales de la app), lo que
    // rompería el cálculo esperado de Disponible en el test de abajo.
    fixedExpenses: [{ id: "noop", name: "Ignorar", amount: "0", bank: "ing" as const, category: "gastos" as const, daily: false }],
    catRules: [],
    planTargets: {},
    rowOrder: [],
  };
}

const fetchMock = vi.fn();

beforeEach(() => {
  cleanup();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ state: buildMockState(), version: 1 }) });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  cleanup();
});

async function waitForLoaded() {
  await waitFor(() => {
    expect(screen.queryByText("Cargando…")).not.toBeInTheDocument();
  });
}

describe("Bancos", () => {
  it("Disponible = Saldo − Pendiente para cada banco", async () => {
    render(<HogarManager />);
    await waitForLoaded();

    const bancosSection = screen.getByRole("heading", { name: "Bancos" }).closest("section");
    expect(bancosSection).not.toBeNull();
    const ingRow = within(bancosSection as HTMLElement).getByText("ING").closest("tr");
    expect(ingRow).not.toBeNull();
    // Saldo 1000 − pendiente 250 (Comida, no pagada) = 750
    expect(within(ingRow as HTMLElement).getByText("750 €")).toBeInTheDocument();
  });
});

describe("Opciones – columna Mensualidad", () => {
  it("el icono de la cabecera contrae la columna y persiste la preferencia", async () => {
    const user = userEvent.setup();
    render(<HogarManager />);
    await waitForLoaded();

    const mensualidadHeader = screen.getByTitle("Contraer columna de mensualidad");
    await user.click(mensualidadHeader);

    expect(screen.getByTitle("Mostrar mensualidad")).toBeInTheDocument();

    await waitFor(() => {
      const putCalls = fetchMock.mock.calls.filter(
        (c: unknown[]) => typeof c[0] === "string" && c[0].includes("hogar-ui-prefs") && (c[1] as Record<string, unknown> | undefined)?.method === "PUT",
      );
      expect(putCalls.length).toBeGreaterThan(0);
      const body = JSON.parse(putCalls[putCalls.length - 1][1].body as string);
      expect(body.mensualidadCollapsed).toBe(true);
    });
  });
});
