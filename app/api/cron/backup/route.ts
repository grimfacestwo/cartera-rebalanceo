import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { isCronAuthed } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { DEFAULT_STATE, currentMonthKey, parseState } from "@/lib/state";

async function fetchBackupPayload() {
  const { rows } = await sql<{
    assets: unknown;
    values: unknown;
    contribution: string;
    months: unknown;
    goals: unknown;
    fixedExpenses: unknown;
    catRules: unknown;
    planTargets: unknown;
    rowOrder: unknown;
  }>`SELECT
      assets, values, contribution, months, goals,
      fixedExpenses AS "fixedExpenses",
      catRules AS "catRules",
      planTargets AS "planTargets",
      rowOrder AS "rowOrder"
    FROM portfolio_state WHERE id = 1`;
  const state = rows.length === 0 ? DEFAULT_STATE : parseState(rows[0]);
  const { assets, values, contribution, months, goals, fixedExpenses, catRules, planTargets, rowOrder } = state;
  return { assets, values, contribution, months, goals, fixedExpenses, catRules, planTargets, rowOrder };
}

// Cron semanal (ver vercel.json) que manda por email el mismo JSON que el
// botón "Exportar" de Ajustes, como copia de seguridad fuera de Postgres.
// Requiere las variables de entorno RESEND_API_KEY, BACKUP_EMAIL_TO y
// CRON_SECRET (ver AGENTS.md).
export async function GET(request: Request) {
  if (!isCronAuthed(request)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  let payload: Awaited<ReturnType<typeof fetchBackupPayload>>;
  try {
    payload = await fetchBackupPayload();
  } catch {
    return NextResponse.json({ error: "No se pudo leer el estado" }, { status: 500 });
  }

  const dateLabel = currentMonthKey();
  const json = JSON.stringify(payload, null, 2);

  const result = await sendEmail({
    subject: `Backup Cartera Rebalanceo — ${dateLabel}`,
    text: "Copia de seguridad semanal automática adjunta en JSON.",
    attachments: [
      {
        filename: `cartera-backup-${dateLabel}.json`,
        content: Buffer.from(json, "utf-8").toString("base64"),
      },
    ],
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
