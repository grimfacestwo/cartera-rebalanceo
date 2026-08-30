import { afterEach, describe, expect, it, vi } from "vitest";
import { putState } from "./persist";
import { DEFAULT_STATE } from "./state";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("putState", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("devuelve 'ok' y la nueva version cuando el guardado tiene éxito", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { ok: true, version: 2 })));
    const result = await putState(DEFAULT_STATE, 1);
    expect(result).toEqual({ kind: "ok", version: 2 });
  });

  it("manda expectedVersion en el cuerpo de la petición", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true, version: 2 }));
    vi.stubGlobal("fetch", fetchMock);
    await putState(DEFAULT_STATE, 1);
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.expectedVersion).toBe(1);
  });

  it("devuelve 'conflict' con el estado del servidor cuando responde 409", async () => {
    const serverState = { ...DEFAULT_STATE, contribution: "999" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(409, { error: "conflict", state: serverState, version: 2 })));
    const result = await putState(DEFAULT_STATE, 1);
    expect(result.kind).toBe("conflict");
    if (result.kind === "conflict") {
      expect(result.state.contribution).toBe("999");
      expect(result.version).toBe(2);
    }
  });

  it("devuelve 'error' si la respuesta no es ok (fuera de 409) o si fetch lanza", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(500, { error: "boom" })));
    expect((await putState(DEFAULT_STATE, null)).kind).toBe("error");

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    expect((await putState(DEFAULT_STATE, null)).kind).toBe("error");
  });
});
