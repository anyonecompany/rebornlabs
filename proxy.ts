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

// service_role 클라이언트 싱글턴
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

interface CachedProfile {
  id: string;
  name: string;
  role: string;
  email: string;
  is_active: boolean;
  must_change_password: boolean;
  ts: number; // 캐시 시각
}

const CACHE_TTL = 5 * 60 * 1000; // 5분
const COOKIE_NAME = "x-profile-cache";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const response = NextResponse.next({
    request: { headers: request.headers },
  });

  // 1. Supabase 세션 확인 (쿠키 기반 — 네트워크 왕복 최소화)
  const supabase = createMiddlewareClient(request, response);
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    // 캐시 쿠키 정리
    response.cookies.delete(COOKIE_NAME);
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // 2. 프로필 캐시 확인 — 쿠키에서 읽기 (DB 0회)
  let profile: CachedProfile | null = null;
  const cached = request.cookies.get(COOKIE_NAME)?.value;
  if (cached) {
    try {
      const parsed = JSON.parse(decodeURIComponent(cached)) as CachedProfile;
      // 같은 유저 + TTL 이내면 캐시 사용
      if (parsed.id === user.id && Date.now() - parsed.ts < CACHE_TTL) {
        profile = parsed;
      }
    } catch {
      // 파싱 실패 → 무시, DB에서 다시 조회
    }
  }

  // 3. 캐시 미스 → DB 조회 + 쿠키에 저장
  if (!profile) {
    const { data, error } = await sc()
      .from("profiles")
      .select("name, role, email, is_active, must_change_password")
      .eq("id", user.id)
      .single() as { data: { name: string; role: string; email: string; is_active: boolean; must_change_password: boolean } | null; error: unknown };

    if (error || !data) {
      return NextResponse.redirect(new URL("/unauthorized", request.url));
    }

    profile = { id: user.id, ...data, ts: Date.now() };

    // 쿠키에 캐시 저장 (httpOnly, 5분 TTL)
    response.cookies.set(COOKIE_NAME, encodeURIComponent(JSON.stringify(profile)), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 300, // 5분
      path: "/",
    });
  }

  // 4. 권한 체크
  if (!profile.is_active) {
    return NextResponse.redirect(new URL("/unauthorized", request.url));
  }

  const role = profile.role as UserRole;

  if (role === "pending") {
    return NextResponse.redirect(new URL("/unauthorized", request.url));
  }

  if (role === "dealer" && isBlocked(pathname, DEALER_BLOCKED)) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (role === "staff" && isBlocked(pathname, STAFF_BLOCKED)) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // 5. profile → 헤더 주입 (layout에서 DB 0회로 읽기)
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-user-id", user.id);
  requestHeaders.set("x-user-profile", encodeURIComponent(JSON.stringify({
    name: profile.name,
    role: profile.role,
    email: profile.email,
    must_change_password: profile.must_change_password,
  })));

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
