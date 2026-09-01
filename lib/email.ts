export type SendEmailResult = { ok: true } | { ok: false; error: string };

// Envío de email vía Resend, compartido por los crons de backup y de aviso
// de disponible negativo (app/api/cron/*/route.ts). Requiere RESEND_API_KEY
// y BACKUP_EMAIL_TO en el entorno; BACKUP_EMAIL_FROM es opcional.
export async function sendEmail(input: {
  subject: string;
  text: string;
  attachments?: { filename: string; content: string }[];
}): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.BACKUP_EMAIL_TO;
  if (!apiKey || !to) {
    return { ok: false, error: "Faltan RESEND_API_KEY o BACKUP_EMAIL_TO" };
  }
  const from = process.env.BACKUP_EMAIL_FROM || "Cartera Rebalanceo <onboarding@resend.dev>";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject: input.subject,
      text: input.text,
      ...(input.attachments ? { attachments: input.attachments } : {}),
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return { ok: false, error: `Resend rechazó el envío: ${detail}` };
  }
  return { ok: true };
}
