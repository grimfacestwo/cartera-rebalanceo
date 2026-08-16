import { sql } from "@vercel/postgres";

let ensured = false;

export async function ensureSectionTable() {
  if (ensured) return;
  await sql`CREATE TABLE IF NOT EXISTS section_state (
    id text PRIMARY KEY,
    data jsonb NOT NULL DEFAULT '{}'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`;
  ensured = true;
}
