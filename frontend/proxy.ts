import { NextRequest, NextResponse } from "next/server";

const PROTECTED_PREFIXES = ["/", "/reports"];
const AUTH_ONLY = ["/login", "/signup"];

export function proxy(req: NextRequest) {
  const token = req.cookies.get("auth_token")?.value;
  const { pathname } = req.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
  const isAuthOnly = AUTH_ONLY.includes(pathname);

  if (isProtected && !isAuthOnly && !token) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  if (isAuthOnly && token) {
    return NextResponse.redirect(new URL("/", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|api|files|favicon.ico).*)"],
};
