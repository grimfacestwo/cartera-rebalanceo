import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { sql } from "@vercel/postgres";
import { expectedToken, safeEqual } from "@/lib/auth";
import { BodyTooLargeError, readJsonLimited } from "@/lib/body";
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
    goals jsonb NOT NULL DEFAULT '[]'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`ALTER TABLE portfolio_state ADD COLUMN IF NOT EXISTS banks jsonb NOT NULL DEFAULT '{}'::jsonb`;
  await sql`ALTER TABLE portfolio_state ADD COLUMN IF NOT EXISTS expenses jsonb NOT NULL DEFAULT '[]'::jsonb`;
  await sql`ALTER TABLE portfolio_state ADD COLUMN IF NOT EXISTS months jsonb NOT NULL DEFAULT '{}'::jsonb`;
  await sql`ALTER TABLE portfolio_state ADD COLUMN IF NOT EXISTS goals jsonb NOT NULL DEFAULT '[]'::jsonb`;
  await sql`ALTER TABLE portfolio_state ADD COLUMN IF NOT EXISTS fixedExpenses jsonb NOT NULL DEFAULT '[]'::jsonb`;
  await sql`ALTER TABLE portfolio_state ADD COLUMN IF NOT EXISTS catRules jsonb NOT NULL DEFAULT '[]'::jsonb`;
  await sql`ALTER TABLE portfolio_state ADD COLUMN IF NOT EXISTS planTargets jsonb NOT NULL DEFAULT '{}'::jsonb`;
  await sql`ALTER TABLE portfolio_state ADD COLUMN IF NOT EXISTS rowOrder jsonb NOT NULL DEFAULT '[]'::jsonb`;
  // Contador de versión para control de concurrencia optimista (ver PUT).
  // Se usa un entero en vez de comparar updated_at porque el timestamptz de
  // Postgres tiene precisión de microsegundos y se trunca a milisegundos al
  // pasar por JSON, así que una comparación de igualdad por timestamp casi
  // nunca coincide aunque nadie más haya guardado.
  await sql`ALTER TABLE portfolio_state ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1`;
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
      goals: unknown;
      fixedExpenses: unknown;
      catRules: unknown;
      planTargets: unknown;
      rowOrder: unknown;
      version: number;
    }>`SELECT
        assets, values, contribution, banks, expenses, months, goals,
        fixedExpenses AS "fixedExpenses",
        catRules AS "catRules",
        planTargets AS "planTargets",
        rowOrder AS "rowOrder",
        version
      FROM portfolio_state WHERE id = 1`;
    if (rows.length === 0) {
      return NextResponse.json({ state: DEFAULT_STATE, version: null });
    }
    return NextResponse.json({
      state: parseState(rows[0]),
      version: rows[0].version,
    });
  } catch {
    return NextResponse.json(
      { error: "No se pudo leer el estado" },
      { status: 500 }
    );
  }
}

const MAX_BODY_BYTES = 2 * 1024 * 1024;

export async function PUT(request: Request) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  let raw: unknown;
  let expectedVersion: number | null = null;
  try {
    raw = await readJsonLimited(request, MAX_BODY_BYTES);
    if (raw && typeof raw === "object" && typeof (raw as { expectedVersion?: unknown }).expectedVersion === "number") {
      expectedVersion = (raw as { expectedVersion: number }).expectedVersion;
    }
  } catch (e) {
    if (e instanceof BodyTooLargeError) {
      return NextResponse.json({ error: "Cuerpo demasiado grande" }, { status: 413 });
    }
    return NextResponse.json({ error: "Cuerpo no válido" }, { status: 400 });
  }
  const state = parseState(raw);
  try {
    await ensureTable();
    // Control de concurrencia optimista: si se manda expectedVersion, la fila
    // solo se actualiza si nadie más ha guardado desde que este cliente
    // cargó el estado (evita que dos pestañas/sesiones/páginas se pisen en
    // silencio con "el último que guarda gana"). Sin expectedVersion (primer
    // guardado tras crear la fila) siempre se aplica.
    const { rows } = await sql<{ version: number }>`
      INSERT INTO portfolio_state (id, assets, values, contribution, months, goals, fixedExpenses, catRules, planTargets, rowOrder, updated_at, version)
      VALUES (
        1,
        ${JSON.stringify(state.assets)}::jsonb,
        ${JSON.stringify(state.values)}::jsonb,
        ${state.contribution},
        ${JSON.stringify(state.months)}::jsonb,
        ${JSON.stringify(state.goals)}::jsonb,
        ${JSON.stringify(state.fixedExpenses)}::jsonb,
        ${JSON.stringify(state.catRules)}::jsonb,
        ${JSON.stringify(state.planTargets)}::jsonb,
        ${JSON.stringify(state.rowOrder)}::jsonb,
        now(),
        1
      )
      ON CONFLICT (id) DO UPDATE SET
        assets = EXCLUDED.assets,
        values = EXCLUDED.values,
        contribution = EXCLUDED.contribution,
        months = EXCLUDED.months,
        goals = EXCLUDED.goals,
        fixedExpenses = EXCLUDED.fixedExpenses,
        catRules = EXCLUDED.catRules,
        planTargets = EXCLUDED.planTargets,
        rowOrder = EXCLUDED.rowOrder,
        updated_at = now(),
        version = portfolio_state.version + 1
      WHERE ${expectedVersion}::int IS NULL OR portfolio_state.version = ${expectedVersion}::int
      RETURNING version
    `;
    if (rows.length === 0) {
      // Conflicto: alguien guardó de por medio. Se devuelve el estado actual
      // para que el cliente se resincronice en vez de perder datos en
      // silencio.
      const current = await sql`
        SELECT
          assets, values, contribution, banks, expenses, months, goals,
          fixedExpenses AS "fixedExpenses",
          catRules AS "catRules",
          planTargets AS "planTargets",
          rowOrder AS "rowOrder",
          version
        FROM portfolio_state WHERE id = 1
      `;
      return NextResponse.json(
        { error: "conflict", state: parseState(current.rows[0]), version: current.rows[0].version },
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
