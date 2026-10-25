import { sql } from "@vercel/postgres";

let ensured = false;

export async function ensureSectionTable() {
  if (ensured) return;
  await sql`CREATE TABLE IF NOT EXISTS section_state (
    id text PRIMARY KEY,
    data jsonb NOT NULL DEFAULT '{}'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`;
  // Mismo control de concurrencia optimista que portfolio_state (ver
  // app/api/state/route.ts): sin esto, dos guardados casi simultáneos a la
  // misma sección (p.ej. Coches o Lectura en dos pestañas) se pisan en
  // silencio con "el último que guarda gana".
  await sql`ALTER TABLE section_state ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1`;
  ensured = true;
}
