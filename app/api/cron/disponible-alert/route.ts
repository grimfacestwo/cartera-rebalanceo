import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { isCronAuthed } from "@/lib/auth";
import { ensureSectionTable } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { computeDisponible, currentMonthKey, parseState } from "@/lib/state";

const ALERT_SLUG = "disponible-alert";

async function wasAlerted(): Promise<boolean> {
  const { rows } = await sql<{ data: unknown }>`SELECT data FROM section_state WHERE id = ${ALERT_SLUG}`;
  const data = rows[0]?.data;
  return !!data && typeof data === "object" && (data as Record<string, unknown>).alerted === true;
}

async function setAlerted(alerted: boolean): Promise<void> {
  await sql`
    INSERT INTO section_state (id, data, updated_at)
    VALUES (${ALERT_SLUG}, ${JSON.stringify({ alerted })}::jsonb, now())
    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()
  `;
}

// Cron diario (ver vercel.json) que avisa por email cuando el Disponible del
// mes actual pasa a negativo — el aviso ya existente (Notification del
// navegador en hogar-manager.tsx) solo llega si tienes la pestaña abierta.
// Solo manda un email por "episodio" negativo: si sigue negativo al día
// siguiente no repite, y se rearma en cuanto vuelve a positivo. Requiere las
// mismas variables de entorno que el backup semanal (ver AGENTS.md).
export async function GET(request: Request) {
  if (!isCronAuthed(request)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  let disponible: number;
  try {
    await ensureSectionTable();
    const { rows } = await sql<{ months: unknown; goals: unknown }>`
      SELECT months, goals FROM portfolio_state WHERE id = 1
    `;
    if (rows.length === 0) {
      return NextResponse.json({ ok: true, skipped: "sin estado" });
    }
    const state = parseState(rows[0]);
    disponible = computeDisponible(state.months, state.goals, currentMonthKey());
  } catch {
    return NextResponse.json({ error: "No se pudo leer el estado" }, { status: 500 });
  }

  const alreadyAlerted = await wasAlerted();

  if (disponible >= 0) {
    if (alreadyAlerted) await setAlerted(false);
    return NextResponse.json({ ok: true, disponible, alerted: false });
  }

  if (alreadyAlerted) {
    return NextResponse.json({ ok: true, disponible, alerted: true, skipped: "ya avisado" });
  }

  const result = await sendEmail({
    subject: `Disponible negativo: ${disponible.toFixed(2)} €`,
    text: `El Disponible de Hogar para ${currentMonthKey()} está en negativo: ${disponible.toFixed(2)} €.\n\nNo volverás a recibir este aviso hasta que vuelva a positivo y caiga de nuevo.`,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  await setAlerted(true);
  return NextResponse.json({ ok: true, disponible, alerted: true });
}
