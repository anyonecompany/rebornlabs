import { NextRequest, NextResponse } from "next/server";
import { createMiddlewareClient } from "@/lib/supabase/middleware";
import { createClient } from "@supabase/supabase-js";
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
const CACHE_TTL = 5 * 60 * 1000; // 5분

// service_role 싱글턴
let _sc: ReturnType<typeof createClient> | null = null;
function sc() {
  if (!_sc) {
    _sc = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
  }
  return _sc;
}

interface ProfileCache {
  id: string;
  name: string;
  role: string;
  email: string;
  is_active: boolean;
  must_change_password: boolean;
  ts: number;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // 1. 세션 쿠키 존재 확인 (네트워크 0)
  const hasSession = request.cookies.getAll().some(
    (c) => c.name.startsWith("sb-") && c.name.endsWith("-auth-token"),
  );

  if (!hasSession) {
    const res = NextResponse.redirect(new URL("/login", request.url));
    res.cookies.delete(COOKIE_NAME);
    return res;
  }

  // 2. 프로필 캐시 체크
  let profile: ProfileCache | null = null;
  const cached = request.cookies.get(COOKIE_NAME)?.value;

  if (cached) {
    try {
      const p = JSON.parse(decodeURIComponent(cached)) as ProfileCache;
      if (p.id && p.role && Date.now() - p.ts < CACHE_TTL) {
        profile = p;
      }
    } catch { /* 캐시 손상 무시 */ }
  }

  // 3. 캐시 미스 → getUser + profiles DB 조회 (이 경우만 네트워크 사용)
  let response: NextResponse;

  if (!profile) {
    const tempResponse = NextResponse.next({ request: { headers: request.headers } });
    const supabase = createMiddlewareClient(request, tempResponse);
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      const res = NextResponse.redirect(new URL("/login", request.url));
      res.cookies.delete(COOKIE_NAME);
      return res;
    }

    const { data, error: pErr } = await sc()
      .from("profiles")
      .select("name, role, email, is_active, must_change_password")
      .eq("id", user.id)
      .single() as { data: ProfileCache | null; error: unknown };

    if (pErr || !data) {
      return NextResponse.redirect(new URL("/unauthorized", request.url));
    }

    profile = { id: user.id, ...data, ts: Date.now() };

    // 응답에 캐시 쿠키 설정 + auth 쿠키 전파
    response = NextResponse.next({
      request: { headers: request.headers },
    });
    // tempResponse의 쿠키(Supabase auth refresh)를 복사
    tempResponse.cookies.getAll().forEach((c) => {
      response.cookies.set(c.name, c.value);
    });
    // 프로필 캐시 쿠키 설정
    response.cookies.set(COOKIE_NAME, encodeURIComponent(JSON.stringify(profile)), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 300,
      path: "/",
    });
  } else {
    // 캐시 히트 — 바로 통과
    response = NextResponse.next({ request: { headers: request.headers } });
  }

  // 4. 권한 체크
  if (!profile.is_active || profile.role === "pending") {
    return NextResponse.redirect(new URL("/unauthorized", request.url));
  }

  const role = profile.role as UserRole;
  if (role === "dealer" && isBlocked(pathname, DEALER_BLOCKED)) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }
  if (role === "staff" && isBlocked(pathname, STAFF_BLOCKED)) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // 5. 프로필 → 헤더 주입 (layout에서 읽기)
  const profilePayload = encodeURIComponent(JSON.stringify({
    name: profile.name,
    role: profile.role,
    email: profile.email,
    must_change_password: profile.must_change_password,
  }));

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-user-id", profile.id);
  requestHeaders.set("x-user-profile", profilePayload);

  return NextResponse.next({
    request: { headers: requestHeaders },
    headers: response.headers,
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
