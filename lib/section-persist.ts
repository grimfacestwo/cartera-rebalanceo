export type PutSectionResult<T> =
  | { kind: "ok"; version: number | null }
  | { kind: "conflict"; data: T; version: number | null }
  | { kind: "error" };

/**
 * Guarda una sección genérica (/api/section/[slug]) con el mismo control de
 * concurrencia optimista que putState usa para portfolio_state (ver
 * lib/persist.ts y app/api/state/route.ts): si expectedVersion ya no
 * coincide con lo que hay en la base de datos (alguien guardó de por medio,
 * p.ej. otra pestaña), el servidor devuelve 409 con su versión actual en vez
 * de sobrescribirla en silencio.
 */
export async function putSection<T>(
  slug: string,
  data: T,
  expectedVersion: number | null,
  parse: (raw: unknown) => T,
  options?: { keepalive?: boolean },
): Promise<PutSectionResult<T>> {
  try {
    const res = await fetch(`/api/section/${slug}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...data, expectedVersion }),
      keepalive: options?.keepalive,
    });
    if (res.status === 409) {
      const body = (await res.json()) as { data?: unknown; version?: number | null };
      return { kind: "conflict", data: parse(body.data), version: body.version ?? null };
    }
    if (!res.ok) return { kind: "error" };
    const body = (await res.json()) as { version?: number | null };
    return { kind: "ok", version: body.version ?? null };
  } catch {
    return { kind: "error" };
  }
}
