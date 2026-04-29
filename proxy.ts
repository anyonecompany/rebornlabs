import { NextRequest, NextResponse } from "next/server";
import { createMiddlewareClient } from "@/lib/supabase/middleware";
import { createClient } from "@supabase/supabase-js";
import type { UserRole } from "@/types/database";

const DEALER_BLOCKED = [
  "/settlements",
  "/expenses",
  "/documents",
  "/users",
  "/team-structure",
  "/audit-logs",
];
const STAFF_BLOCKED = ["/users", "/team-structure", "/audit-logs"];
// director / team_leader — 관리직. 조직 데이터(상담·판매·계약·견적·차량·정산·지출·문서)는 접근 허용.
// 본사 전용 관리 기능(/users, /team-structure, /audit-logs, /vehicle-models)만 차단.
// expenses/documents는 매니저도 영업 비용·자료 활용 필요 → 차단 해제 (등록·조회 가능, 삭제는 admin only).
const MANAGER_BLOCKED = [
  "/users",
  "/team-structure",
  "/audit-logs",
  "/vehicle-models",
];

function isBlocked(pathname: string, blockedPaths: string[]): boolean {
  return blockedPaths.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

const PUBLIC_PATHS = ["/login", "/unauthorized", "/api", "/_next", "/favicon.ico", "/sign", "/quote", "/cars", "/apply", "/privacy"];

function isPublicPath(pathname: string): boolean {
  // 루트(/) 정확 매칭 — 공개 도메인은 랜딩, 어드민 도메인은 page.tsx에서 /login 리다이렉트.
  if (pathname === "/") return true;
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

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

const CACHE_COOKIE = "x-profile-cache";
const CACHE_MAX_AGE = 300; // 5분

interface CachedProfile {
  id: string;
  name: string;
  role: string;
  email: string;
  is_active: boolean;
  must_change_password: boolean;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // ── 1. 세션 쿠키 존재 확인 (네트워크 0) ──
  const hasSession = request.cookies.getAll().some(
    (c) => c.name.startsWith("sb-") && c.name.includes("-auth-token"),
  );

  if (!hasSession) {
    const res = NextResponse.redirect(new URL("/login", request.url));
    res.cookies.delete(CACHE_COOKIE);
    return res;
  }

  // ── 2. 캐시 쿠키에서 프로필 읽기 (네트워크 0) ──
  let profile: CachedProfile | null = null;
  let corruptedCache = false;
  const cached = request.cookies.get(CACHE_COOKIE)?.value;

  if (cached) {
    try {
      const parsed = JSON.parse(decodeURIComponent(cached));
      // 필수 필드 검증 — 손상된 캐시 방어
      if (parsed?.id && parsed?.role && typeof parsed?.is_active === "boolean") {
        profile = parsed as CachedProfile;
      } else {
        // 파싱은 성공했으나 필수 필드 누락 → 손상 캐시로 판정
        corruptedCache = true;
      }
    } catch {
      // JSON 파싱 자체 실패 → 손상 캐시로 판정
      corruptedCache = true;
      profile = null;
    }
  }

  // ── 3. 캐시 미스 → getUser + profiles DB (네트워크 2회, 첫 요청만) ──
  let mustSetCookie = false;
  let authCookies: { name: string; value: string }[] = [];

  if (!profile) {
    const tempRes = NextResponse.next({ request: { headers: request.headers } });
    const supabase = createMiddlewareClient(request, tempRes);

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    // auth 갱신 쿠키 보존 (토큰 리프레시 시 설정됨)
    authCookies = tempRes.cookies.getAll();

    if (authError || !user) {
      const res = NextResponse.redirect(new URL("/login", request.url));
      res.cookies.delete(CACHE_COOKIE);
      return res;
    }

    const { data, error: pErr } = await sc()
      .from("profiles")
      .select("name, role, email, is_active, must_change_password")
      .eq("id", user.id)
      .single() as {
        data: Omit<CachedProfile, "id"> | null;
        error: unknown;
      };

    if (pErr || !data) {
      return NextResponse.redirect(new URL("/unauthorized", request.url));
    }

    profile = { id: user.id, ...data };
    mustSetCookie = true;
  }

  // ── 4. 권한 체크 ──
  if (!profile.is_active || profile.role === "pending") {
    return NextResponse.redirect(new URL("/unauthorized", request.url));
  }

  // ── 4a. 비밀번호 강제 변경 체크 ──
  // must_change_password가 true이면 /profile 외의 경로는 /profile?force=true로 리다이렉트
  if (profile.must_change_password && pathname !== "/profile") {
    return NextResponse.redirect(new URL("/profile?force=true", request.url));
  }

  const role = profile.role as UserRole;

  if (role === "dealer" && isBlocked(pathname, DEALER_BLOCKED)) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (role === "staff" && isBlocked(pathname, STAFF_BLOCKED)) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (
    (role === "director" || role === "team_leader") &&
    isBlocked(pathname, MANAGER_BLOCKED)
  ) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // ── 5. 프로필 → 헤더 주입 (layout에서 읽기) ──
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-user-id", profile.id);
  requestHeaders.set("x-user-profile", encodeURIComponent(JSON.stringify({
    name: profile.name,
    role: profile.role,
    email: profile.email,
    must_change_password: profile.must_change_password,
  })));

  const res = NextResponse.next({ request: { headers: requestHeaders } });

  // ── 6-pre. 손상 캐시 즉시 삭제 → 무한 리다이렉트 방지 ──
  if (corruptedCache) {
    res.cookies.delete(CACHE_COOKIE);
  }

  // ── 6. auth 갱신 쿠키 전파 (토큰 리프레시) ──
  for (const c of authCookies) {
    res.cookies.set(c.name, c.value);
  }

  // ── 7. 캐시 미스였으면 응답 쿠키에 프로필 캐싱 ──
  if (mustSetCookie) {
    res.cookies.set(CACHE_COOKIE, encodeURIComponent(JSON.stringify(profile)), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: CACHE_MAX_AGE,
      path: "/",
    });
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
