import { NextRequest, NextResponse } from "next/server";
import type { UserRole } from "@/types/database";

const DEALER_BLOCKED = ["/settlements", "/expenses", "/documents", "/users", "/audit-logs"];
const STAFF_BLOCKED = ["/users", "/audit-logs"];

function isBlocked(pathname: string, blockedPaths: string[]): boolean {
  return blockedPaths.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

const PUBLIC_PATHS = ["/login", "/unauthorized", "/api", "/_next", "/favicon.ico"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

const COOKIE_NAME = "x-profile-cache";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // 세션 쿠키 존재 여부만 체크 (네트워크 호출 0)
  const hasSession = request.cookies.getAll().some(
    (c) => c.name.startsWith("sb-") && c.name.endsWith("-auth-token"),
  );

  if (!hasSession) {
    const res = NextResponse.redirect(new URL("/login", request.url));
    res.cookies.delete(COOKIE_NAME);
    return res;
  }

  // 프로필 캐시 쿠키에서 역할 읽기 (DB 0회)
  const cached = request.cookies.get(COOKIE_NAME)?.value;
  let role: UserRole | null = null;

  if (cached) {
    try {
      const parsed = JSON.parse(decodeURIComponent(cached));
      role = parsed.role as UserRole;
    } catch { /* 무시 */ }
  }

  // 역할 기반 라우트 차단 (캐시 없으면 통과 — layout에서 조회)
  if (role) {
    if (!["admin", "staff", "dealer"].includes(role)) {
      return NextResponse.redirect(new URL("/unauthorized", request.url));
    }
    if (role === "dealer" && isBlocked(pathname, DEALER_BLOCKED)) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    if (role === "staff" && isBlocked(pathname, STAFF_BLOCKED)) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  // 캐시 쿠키 데이터를 헤더에 주입 (layout에서 읽기)
  const requestHeaders = new Headers(request.headers);
  if (cached) {
    requestHeaders.set("x-user-profile", cached);
    try {
      const p = JSON.parse(decodeURIComponent(cached));
      if (p.id) requestHeaders.set("x-user-id", p.id);
    } catch { /* 무시 */ }
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
