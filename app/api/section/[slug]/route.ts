import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { sql } from "@vercel/postgres";
import { expectedToken, safeEqual } from "@/lib/auth";
import { ensureSectionTable } from "@/lib/db";

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
    const { rows } = await sql<{ data: unknown }>`SELECT data FROM section_state WHERE id = ${slug}`;
    if (rows.length === 0) {
      return NextResponse.json({ data: { note: "" } });
    }
    return NextResponse.json({ data: rows[0].data });
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
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo no válido" }, { status: 400 });
  }
  const data: unknown =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? { note: typeof (raw as Record<string, unknown>).note === "string" ? (raw as Record<string, unknown>).note : "" }
      : { note: "" };
  try {
    await ensureSectionTable();
    await sql`
      INSERT INTO section_state (id, data, updated_at)
      VALUES (${slug}, ${JSON.stringify(data)}::jsonb, now())
      ON CONFLICT (id) DO UPDATE SET
        data = EXCLUDED.data,
        updated_at = now()
    `;
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "No se pudo guardar el estado" },
      { status: 500 }
    );
  }
}
