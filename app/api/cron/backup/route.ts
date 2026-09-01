import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { safeEqual } from "@/lib/auth";
import { DEFAULT_STATE, currentMonthKey, parseState } from "@/lib/state";

function isAuthed(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  return safeEqual(header, `Bearer ${secret}`);
}

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
  if (!isAuthed(request)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.BACKUP_EMAIL_TO;
  if (!apiKey || !to) {
    return NextResponse.json(
      { error: "Faltan RESEND_API_KEY o BACKUP_EMAIL_TO" },
      { status: 500 },
    );
  }
  const from = process.env.BACKUP_EMAIL_FROM || "Cartera Rebalanceo <onboarding@resend.dev>";

  let payload: Awaited<ReturnType<typeof fetchBackupPayload>>;
  try {
    payload = await fetchBackupPayload();
  } catch {
    return NextResponse.json({ error: "No se pudo leer el estado" }, { status: 500 });
  }

  const dateLabel = currentMonthKey();
  const json = JSON.stringify(payload, null, 2);

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject: `Backup Cartera Rebalanceo — ${dateLabel}`,
      text: "Copia de seguridad semanal automática adjunta en JSON.",
      attachments: [
        {
          filename: `cartera-backup-${dateLabel}.json`,
          content: Buffer.from(json, "utf-8").toString("base64"),
        },
      ],
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return NextResponse.json({ error: "Resend rechazó el envío", detail }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
