import { NextResponse, type NextRequest } from "next/server";
import { expectedToken, safeEqual } from "@/lib/auth";

export async function proxy(request: NextRequest) {
  const token = await expectedToken();
  if (token === null) return NextResponse.next();
  const cookie = request.cookies.get("site_auth")?.value;
  if (cookie === undefined || !safeEqual(cookie, token)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|login).*)"],
};
