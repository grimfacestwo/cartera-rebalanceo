import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { expectedToken, safeEqual } from "@/lib/auth";

async function isAuthed(): Promise<boolean> {
  const token = await expectedToken();
  if (token === null) return true;
  const store = await cookies();
  const cookie = store.get("site_auth")?.value;
  return cookie !== undefined && safeEqual(cookie, token);
}

const FETCH_TIMEOUT_MS = 8000;
// Las portadas de Open Library (tamaño "M") rondan 15-30KB; un límite de 3MB
// es sobradamente generoso y evita que una respuesta inesperada se cuele.
const MAX_COVER_BYTES = 3 * 1024 * 1024;

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Descarga una imagen y la devuelve como data: URI, o null si no se pudo. */
async function downloadAsDataUri(url: string): Promise<string | null> {
  const res = await fetchWithTimeout(url, FETCH_TIMEOUT_MS);
  if (!res.ok) return null;
  const buf = await res.arrayBuffer();
  if (buf.byteLength === 0 || buf.byteLength > MAX_COVER_BYTES) return null;
  const contentType = res.headers.get("content-type") ?? "image/jpeg";
  const base64 = Buffer.from(buf).toString("base64");
  return `data:${contentType};base64,${base64}`;
}

/**
 * Busca/descarga la portada de un libro y la devuelve ya convertida en
 * data: URI. Las llamadas (tanto a Open Library como a una URL que el
 * usuario pegue a mano) pasan por aquí (servidor) en vez de hacerse desde el
 * navegador, para no tener que tocar la Content-Security-Policy
 * (connect-src/img-src siguen limitados a 'self' — ver next.config.ts).
 */
export async function GET(request: Request) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url")?.trim() ?? "";
  const title = searchParams.get("title")?.trim() ?? "";
  const author = searchParams.get("author")?.trim() ?? "";

  try {
    // URL pegada a mano: se descarga directamente, sin pasar por Open
    // Library. Solo se admite http(s) (no file:, data:, etc.).
    if (url) {
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        return NextResponse.json({ cover: null });
      }
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return NextResponse.json({ cover: null });
      }
      return NextResponse.json({ cover: await downloadAsDataUri(url) });
    }

    if (!title) {
      return NextResponse.json({ error: "Falta el título o la URL" }, { status: 400 });
    }

    const query = new URLSearchParams({ title, limit: "1", fields: "cover_i" });
    if (author) query.set("author", author);
    const searchRes = await fetchWithTimeout(`https://openlibrary.org/search.json?${query}`, FETCH_TIMEOUT_MS);
    if (!searchRes.ok) return NextResponse.json({ cover: null });

    const searchData = (await searchRes.json()) as { docs?: Array<{ cover_i?: number }> };
    const coverId = searchData.docs?.[0]?.cover_i;
    if (!coverId) return NextResponse.json({ cover: null });

    const cover = await downloadAsDataUri(`https://covers.openlibrary.org/b/id/${coverId}-M.jpg`);
    return NextResponse.json({ cover });
  } catch {
    return NextResponse.json({ cover: null });
  }
}
