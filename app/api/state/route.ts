import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { sql } from "@vercel/postgres";
import { expectedToken, safeEqual } from "@/lib/auth";
import { DEFAULT_STATE, parseState } from "@/lib/state";

async function isAuthed(): Promise<boolean> {
  const token = await expectedToken();
  if (token === null) return true;
  const store = await cookies();
  const cookie = store.get("site_auth")?.value;
  return cookie !== undefined && safeEqual(cookie, token);
}

let ensured = false;

async function ensureTable() {
  if (ensured) return;
  await sql`CREATE TABLE IF NOT EXISTS portfolio_state (
    id integer PRIMARY KEY CHECK (id = 1),
    assets jsonb NOT NULL,
    values jsonb NOT NULL,
    contribution text NOT NULL DEFAULT '',
    banks jsonb NOT NULL DEFAULT '{}'::jsonb,
    expenses jsonb NOT NULL DEFAULT '[]'::jsonb,
    months jsonb NOT NULL DEFAULT '{}'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`ALTER TABLE portfolio_state ADD COLUMN IF NOT EXISTS banks jsonb NOT NULL DEFAULT '{}'::jsonb`;
  await sql`ALTER TABLE portfolio_state ADD COLUMN IF NOT EXISTS expenses jsonb NOT NULL DEFAULT '[]'::jsonb`;
  await sql`ALTER TABLE portfolio_state ADD COLUMN IF NOT EXISTS months jsonb NOT NULL DEFAULT '{}'::jsonb`;
  ensured = true;
}

export async function GET() {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    await ensureTable();
    const { rows } = await sql<{
      assets: unknown;
      values: unknown;
      contribution: string;
      banks: unknown;
      expenses: unknown;
      months: unknown;
    }>`SELECT assets, values, contribution, banks, expenses, months FROM portfolio_state WHERE id = 1`;
    if (rows.length === 0) {
      return NextResponse.json({ state: DEFAULT_STATE });
    }
    return NextResponse.json({
      state: parseState(rows[0]),
    });
  } catch {
    return NextResponse.json(
      { error: "No se pudo leer el estado" },
      { status: 500 }
    );
  }
}

const MAX_BODY_BYTES = 512 * 1024;

export async function PUT(request: Request) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const cl = request.headers.get("content-length");
  if (cl && Number(cl) > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Cuerpo demasiado grande" }, { status: 413 });
  }
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo no válido" }, { status: 400 });
  }
  const state = parseState(raw);
  try {
    await ensureTable();
    await sql`
      INSERT INTO portfolio_state (id, assets, values, contribution, months, updated_at)
      VALUES (
        1,
        ${JSON.stringify(state.assets)}::jsonb,
        ${JSON.stringify(state.values)}::jsonb,
        ${state.contribution},
        ${JSON.stringify(state.months)}::jsonb,
        now()
      )
      ON CONFLICT (id) DO UPDATE SET
        assets = EXCLUDED.assets,
        values = EXCLUDED.values,
        contribution = EXCLUDED.contribution,
        months = EXCLUDED.months,
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
