const encoder = new TextEncoder();

export function getSitePassword(): string | undefined {
  return process.env.SITE_PASSWORD;
}

export async function sha256Hex(input: string): Promise<string> {
  const data = encoder.encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

let cachedToken: string | null | undefined;

export async function expectedToken(): Promise<string | null> {
  const password = getSitePassword();
  if (!password) return null;
  if (cachedToken !== undefined) return cachedToken;
  cachedToken = await sha256Hex(password);
  return cachedToken;
}

export function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  let diff = ab.length ^ bb.length;
  const len = Math.max(ab.length, bb.length);
  for (let i = 0; i < len; i++) {
    diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diff === 0;
}

// Autenticación de los endpoints de cron (app/api/cron/*/route.ts). Vercel
// añade automáticamente `Authorization: Bearer <CRON_SECRET>` en las
// peticiones que él mismo dispara desde vercel.json — sin la variable de
// entorno configurada, se rechaza cualquier llamada (fail-closed).
export function isCronAuthed(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  return safeEqual(header, `Bearer ${secret}`);
}
