import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { sql } from "@vercel/postgres";
import { expectedToken, safeEqual } from "@/lib/auth";
import { BodyTooLargeError, readJsonLimited } from "@/lib/body";
import { ensureSectionTable } from "@/lib/db";

const MAX_BODY_BYTES = 16 * 1024 * 1024;

const SLUG_RE = /^[a-z0-9-]+$/;

async function isAuthed(): Promise<boolean> {
  const token = await expectedToken();
  if (token === null) return true;
  const store = await cookies();
  const cookie = store.get("site_auth")?.value;
  return cookie !== undefined && safeEqual(cookie, token);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  if (!SLUG_RE.test(slug)) {
    return NextResponse.json({ error: "Slug no válido" }, { status: 400 });
  }
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    await ensureSectionTable();
    const { rows } = await sql<{ data: unknown; version: number }>`SELECT data, version FROM section_state WHERE id = ${slug}`;
    if (rows.length === 0) {
      return NextResponse.json({ data: { note: "" }, version: null });
    }
    return NextResponse.json({ data: rows[0].data, version: rows[0].version });
  } catch {
    return NextResponse.json(
      { error: "No se pudo leer el estado" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  if (!SLUG_RE.test(slug)) {
    return NextResponse.json({ error: "Slug no válido" }, { status: 400 });
  }
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  let raw: unknown;
  try {
    raw = await readJsonLimited(request, MAX_BODY_BYTES);
  } catch (e) {
    if (e instanceof BodyTooLargeError) {
      return NextResponse.json({ error: "Cuerpo demasiado grande" }, { status: 413 });
    }
    return NextResponse.json({ error: "Cuerpo no válido" }, { status: 400 });
  }
  // expectedVersion (opcional, mismo patrón que portfolio_state — ver
  // app/api/state/route.ts) va al mismo nivel que los datos en el body, así
  // que se separa antes de guardar el resto tal cual en la columna `data`.
  let expectedVersion: number | null = null;
  let data: unknown = {};
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const { expectedVersion: ev, ...rest } = raw as Record<string, unknown>;
    if (typeof ev === "number") expectedVersion = ev;
    data = rest;
  }
  try {
    await ensureSectionTable();
    const { rows } = await sql<{ version: number }>`
      INSERT INTO section_state (id, data, updated_at, version)
      VALUES (${slug}, ${JSON.stringify(data)}::jsonb, now(), 1)
      ON CONFLICT (id) DO UPDATE SET
        data = EXCLUDED.data,
        updated_at = now(),
        version = section_state.version + 1
      WHERE ${expectedVersion}::int IS NULL OR section_state.version = ${expectedVersion}::int
      RETURNING version
    `;
    if (rows.length === 0) {
      // Conflicto: alguien guardó de por medio. Se devuelve el estado actual
      // para que el cliente se resincronice en vez de perder datos en
      // silencio (ver app/api/state/route.ts para el mismo patrón).
      const current = await sql<{ data: unknown; version: number }>`
        SELECT data, version FROM section_state WHERE id = ${slug}
      `;
      return NextResponse.json(
        { error: "conflict", data: current.rows[0]?.data ?? null, version: current.rows[0]?.version ?? null },
        { status: 409 }
      );
    }
    return NextResponse.json({ ok: true, version: rows[0].version });
  } catch {
    return NextResponse.json(
      { error: "No se pudo guardar el estado" },
      { status: 500 }
    );
  }
}
