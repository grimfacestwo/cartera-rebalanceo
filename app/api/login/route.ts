import { NextResponse } from "next/server";
import { getSitePassword, safeEqual, sha256Hex } from "@/lib/auth";
import { isRateLimited, recordAttempt } from "@/lib/rate-limit";

const MAX_AGE = 60 * 60 * 24 * 30;

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  if (await isRateLimited(ip)) {
    return NextResponse.json({ error: "Demasiados intentos" }, { status: 429 });
  }

  let body: { password?: unknown } = {};
  try {
    body = (await request.json()) as { password?: unknown };
  } catch {
    /* cuerpo no válido */
  }

  const password = getSitePassword();
  if (!password || typeof body.password !== "string") {
    await recordAttempt(ip);
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const expectedHash = await sha256Hex(password);
  const submittedHash = await sha256Hex(body.password);
  if (!safeEqual(submittedHash, expectedHash)) {
    await recordAttempt(ip);
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set("site_auth", expectedHash, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
  return res;
}
