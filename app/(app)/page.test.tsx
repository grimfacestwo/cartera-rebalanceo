import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Page from "./page";

vi.mock("./page.module.css", () => ({
  default: new Proxy(
    {},
    {
      get: (_target, prop: string) => prop,
    },
  ),
}));

const fetchMock = vi.fn();

beforeEach(() => {
  cleanup();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ state: {} }) });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  cleanup();
});

describe("Objetivos tab – addGoal", () => {
  it("al pulsar Añadir, la meta aparece en la lista", async () => {
    const user = userEvent.setup();

    render(<Page />);

    await waitFor(() => {
      expect(screen.queryByText("Cargando…")).not.toBeInTheDocument();
    });

    await user.click(screen.getAllByRole("tab", { name: "Objetivos" })[0]);

    const nombreInput = screen.getAllByPlaceholderText("Nombre")[0];
    await user.type(nombreInput, "Coche nuevo");

    const addBtn = screen.getByRole("button", { name: "Añadir" });
    await user.click(addBtn);

    expect(screen.getByDisplayValue("Coche nuevo")).toBeInTheDocument();
    expect(screen.queryByText("Sin objetivos. Crea el primero abajo.")).not.toBeInTheDocument();
  });

  it("el PUT incluye goals con la nueva meta", async () => {
    const user = userEvent.setup();

    render(<Page />);

    await waitFor(() => {
      expect(screen.queryByText("Cargando…")).not.toBeInTheDocument();
    });

    await user.click(screen.getAllByRole("tab", { name: "Objetivos" })[0]);

    const nombreInput = screen.getAllByPlaceholderText("Nombre")[0];
    await user.type(nombreInput, "Viaje");

    await user.click(screen.getByRole("button", { name: "Añadir" }));

    await waitFor(() => {
      const putCalls = fetchMock.mock.calls.filter(
        (c: unknown[]) => c[1] && typeof c[1] === "object" && (c[1] as Record<string, unknown>).method === "PUT",
      );
      expect(putCalls.length).toBeGreaterThan(0);
      const body = JSON.parse(putCalls[0][1].body as string);
      expect(body.goals).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: "Viaje" })]),
      );
    });
  });
});

describe("Cartera tab – Añadir activo y aportaciones", () => {
  it("permite añadir un nuevo activo directamente desde la pestaña Cartera", async () => {
    const user = userEvent.setup();
    render(<Page />);

    await waitFor(() => {
      expect(screen.queryByText("Cargando…")).not.toBeInTheDocument();
    });

    const addAssetBtn = screen.getByRole("button", { name: "Añadir nuevo activo" });
    await user.click(addAssetBtn);

    const nameInput = screen.getByPlaceholderText("Ej. S&P 500, MSCI Emergentes...");
    await user.type(nameInput, "S&P 500");

    const targetInput = screen.getByPlaceholderText("10");
    await user.type(targetInput, "15");

    const confirmBtn = screen.getByRole("button", { name: "✓ Añadir a la cartera" });
    await user.click(confirmBtn);

    expect(screen.getByText("S&P 500")).toBeInTheDocument();
  });

  it("permite sumar una aportación directamente a un activo y verla en el historial", async () => {
    const user = userEvent.setup();
    render(<Page />);

    await waitFor(() => {
      expect(screen.queryByText("Cargando…")).not.toBeInTheDocument();
    });

    const aportarBtns = screen.getAllByRole("button", { name: "+ Aportar €" });
    await user.click(aportarBtns[0]);

    const amountInput = screen.getByPlaceholderText("Ej. 250");
    await user.type(amountInput, "500");

    const saveContribBtn = screen.getByRole("button", { name: /Sumar.*al saldo y guardar/ });
    await user.click(saveContribBtn);

    expect(screen.getByText("+500,00 €")).toBeInTheDocument();
  });
});

