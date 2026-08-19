import { sql } from "@vercel/postgres";

const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 5;

let ensured: Promise<void> | null = null;

function ensureTable(): Promise<void> {
  if (!ensured) {
    ensured = sql`
      CREATE TABLE IF NOT EXISTS login_attempts (
        ip text PRIMARY KEY,
        attempts jsonb NOT NULL DEFAULT '[]'::jsonb,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `
      .then(() => undefined)
      .catch((e) => {
        ensured = null;
        throw e;
      });
  }
  return ensured;
}

export async function isRateLimited(ip: string): Promise<boolean> {
  try {
    await ensureTable();
    const { rows } = await sql<{ attempts: number[] }>`
      SELECT attempts FROM login_attempts WHERE ip = ${ip}
    `;
    const now = Date.now();
    const history = rows[0]?.attempts ?? [];
    return history.filter((t) => now - t < WINDOW_MS).length >= MAX_ATTEMPTS;
  } catch {
    return false;
  }
}

export async function recordAttempt(ip: string): Promise<void> {
  try {
    await ensureTable();
    const { rows } = await sql<{ attempts: number[] }>`
      SELECT attempts FROM login_attempts WHERE ip = ${ip}
    `;
    const now = Date.now();
    const history = (rows[0]?.attempts ?? []).filter((t) => now - t < WINDOW_MS);
    history.push(now);
    await sql`
      INSERT INTO login_attempts (ip, attempts, updated_at)
      VALUES (${ip}, ${JSON.stringify(history)}::jsonb, now())
      ON CONFLICT (ip) DO UPDATE SET attempts = EXCLUDED.attempts, updated_at = now()
    `;
  } catch {
    /* best-effort */
  }
}
