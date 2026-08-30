import { parseState, type PortfolioState } from "./state";

export type PutStateResult =
  | { kind: "ok"; version: number | null }
  | { kind: "conflict"; state: PortfolioState; version: number | null }
  | { kind: "error" };

/**
 * Guarda el estado con control de concurrencia optimista: si `expectedVersion`
 * ya no coincide con lo que hay en la base de datos (alguien más guardó de
 * por medio, p.ej. otra pestaña u otra página que también edita /api/state),
 * el servidor devuelve 409 con su estado actual en vez de sobrescribirlo en
 * silencio — ver app/api/state/route.ts.
 */
export async function putState(
  state: PortfolioState,
  expectedVersion: number | null,
  options?: { keepalive?: boolean },
): Promise<PutStateResult> {
  try {
    const res = await fetch("/api/state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...state, expectedVersion }),
      keepalive: options?.keepalive,
    });
    if (res.status === 409) {
      const data = (await res.json()) as { state?: unknown; version?: number | null };
      return { kind: "conflict", state: parseState(data.state), version: data.version ?? null };
    }
    if (!res.ok) return { kind: "error" };
    const data = (await res.json()) as { version?: number | null };
    return { kind: "ok", version: data.version ?? null };
  } catch {
    return { kind: "error" };
  }
}
