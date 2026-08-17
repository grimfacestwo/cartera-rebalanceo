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
