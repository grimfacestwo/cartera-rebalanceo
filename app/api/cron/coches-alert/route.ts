import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { isCronAuthed } from "@/lib/auth";
import { ensureSectionTable } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { effectiveLastKm, maintenanceMessage, maintenanceStatus, parseCochesState, revisionStatus } from "@/lib/coches";

const ALERT_SLUG = "coches-alert";
const COCHES_SLUG = "coches";

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

// Cron diario (ver vercel.json) que avisa por email cuando algo de Coches
// está vencido — mismo patrón que el aviso de "Disponible negativo" de
// Hogar (app/api/cron/disponible-alert/route.ts): un email por "episodio"
// con al menos un vencido, no repite hasta que todo vuelve a estar al día y
// algo vuelve a vencer después.
//
// "Vencido" usa exactamente la misma lógica que la campanita de Coches
// (pendingAlerts en lib/coches.ts), que cubre los DOS sistemas de la
// sección: el mantenimiento por intervalo de km/meses (maintenanceStatus,
// lo que de verdad usa este usuario) y la lista de revisiones con fecha de
// vencimiento (revisionStatus, vacía en la práctica mientras no se use esa
// lista) — basarse solo en uno de los dos habría dejado el aviso mudo.
export async function GET(request: Request) {
  if (!isCronAuthed(request)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  let lines: string[];
  try {
    await ensureSectionTable();
    const { rows } = await sql<{ data: unknown }>`SELECT data FROM section_state WHERE id = ${COCHES_SLUG}`;
    if (rows.length === 0) {
      return NextResponse.json({ ok: true, skipped: "sin estado" });
    }
    const state = parseCochesState(rows[0].data);
    lines = [];
    for (const v of state.vehicles) {
      const name = v.name || "Vehículo sin nombre";
      const vehicleRevisions = state.maintenanceRevisions.filter((r) => r.vehicleId === v.id);
      for (const m of v.maintenance) {
        const eff = effectiveLastKm(m, state.repairs, v.id, vehicleRevisions);
        if (maintenanceStatus(m, v.currentKm, eff.km, eff.date) === "overdue") {
          lines.push(`- ${name}: ${maintenanceMessage(m, v.currentKm, eff.km, eff.date)}`);
        }
      }
    }
    const vehicleName = new Map(state.vehicles.map((v) => [v.id, v.name || "Vehículo sin nombre"]));
    for (const rev of state.revisions) {
      if (revisionStatus(rev) === "overdue") {
        lines.push(`- ${vehicleName.get(rev.vehicleId) ?? "Vehículo"}: ${rev.title || "Revisión"} (vencía el ${rev.dueDate || "sin fecha"})`);
      }
    }
  } catch {
    return NextResponse.json({ error: "No se pudo leer el estado" }, { status: 500 });
  }

  const alreadyAlerted = await wasAlerted();

  if (lines.length === 0) {
    if (alreadyAlerted) await setAlerted(false);
    return NextResponse.json({ ok: true, overdue: 0, alerted: false });
  }

  if (alreadyAlerted) {
    return NextResponse.json({ ok: true, overdue: lines.length, alerted: true, skipped: "ya avisado" });
  }

  const result = await sendEmail({
    subject: `${lines.length} aviso${lines.length === 1 ? "" : "s"} de mantenimiento vencido${lines.length === 1 ? "" : "s"} en Coches`,
    text: `Tienes mantenimiento vencido en Coches:\n\n${lines.join("\n")}\n\nNo volverás a recibir este aviso hasta que lo pongas al día y vuelva a vencer algo más adelante.`,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  await setAlerted(true);
  return NextResponse.json({ ok: true, overdue: lines.length, alerted: true });
}
