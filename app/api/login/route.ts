import { NextResponse } from "next/server";
import { getSitePassword, safeEqual, sha256Hex } from "@/lib/auth";

const MAX_AGE = 60 * 60 * 24 * 30;

export async function POST(request: Request) {
  let body: { password?: unknown } = {};
  try {
    body = (await request.json()) as { password?: unknown };
  } catch {
    /* cuerpo no válido */
  }

  const expected = getSitePassword();
  if (
    !expected ||
    typeof body.password !== "string" ||
    !safeEqual(body.password, expected)
  ) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const token = await sha256Hex(expected);
  const res = NextResponse.json({ ok: true });
  res.cookies.set("site_auth", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
  return res;
}
