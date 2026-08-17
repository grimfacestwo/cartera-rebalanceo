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
  if (cachedToken !== undefined) return cachedToken;
  const password = getSitePassword();
  cachedToken = password ? await sha256Hex(password) : null;
  return cachedToken;
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
