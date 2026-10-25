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

/**
 * Busca la portada de un libro por título/autor en Open Library y la
 * devuelve ya descargada como data: URI. Las llamadas a Open Library pasan
 * por aquí (servidor) en vez de hacerse desde el navegador para no tener que
 * tocar la Content-Security-Policy (connect-src/img-src siguen limitados a
 * 'self' — ver next.config.ts).
 */
export async function GET(request: Request) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const title = searchParams.get("title")?.trim() ?? "";
  const author = searchParams.get("author")?.trim() ?? "";
  if (!title) {
    return NextResponse.json({ error: "Falta el título" }, { status: 400 });
  }

  try {
    const query = new URLSearchParams({ title, limit: "1", fields: "cover_i" });
    if (author) query.set("author", author);
    const searchRes = await fetchWithTimeout(`https://openlibrary.org/search.json?${query}`, FETCH_TIMEOUT_MS);
    if (!searchRes.ok) return NextResponse.json({ cover: null });

    const searchData = (await searchRes.json()) as { docs?: Array<{ cover_i?: number }> };
    const coverId = searchData.docs?.[0]?.cover_i;
    if (!coverId) return NextResponse.json({ cover: null });

    const imgRes = await fetchWithTimeout(`https://covers.openlibrary.org/b/id/${coverId}-M.jpg`, FETCH_TIMEOUT_MS);
    if (!imgRes.ok) return NextResponse.json({ cover: null });

    const buf = await imgRes.arrayBuffer();
    if (buf.byteLength === 0 || buf.byteLength > MAX_COVER_BYTES) {
      return NextResponse.json({ cover: null });
    }
    const contentType = imgRes.headers.get("content-type") ?? "image/jpeg";
    const base64 = Buffer.from(buf).toString("base64");
    return NextResponse.json({ cover: `data:${contentType};base64,${base64}` });
  } catch {
    return NextResponse.json({ cover: null });
  }
}
