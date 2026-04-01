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
    (c) => c.name.startsWith("sb-") && c.name.endsWith("-auth-token"),
  );

  if (!hasSession) {
    const res = NextResponse.redirect(new URL("/login", request.url));
    res.cookies.delete(CACHE_COOKIE);
    return res;
  }

  // ── 2. 캐시 쿠키에서 프로필 읽기 (네트워크 0) ──
  let profile: CachedProfile | null = null;
  const cached = request.cookies.get(CACHE_COOKIE)?.value;

  if (cached) {
    try {
      profile = JSON.parse(decodeURIComponent(cached)) as CachedProfile;
    } catch {
      profile = null;
    }
  }

  // ── 3. 캐시 미스 → getUser + profiles DB (네트워크 2회, 첫 요청만) ──
  let mustSetCookie = false;

  if (!profile) {
    const response = NextResponse.next({ request: { headers: request.headers } });
    const supabase = createMiddlewareClient(request, response);

    const { data: { user }, error: authError } = await supabase.auth.getUser();

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

  const role = profile.role as UserRole;

  if (role === "dealer" && isBlocked(pathname, DEALER_BLOCKED)) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (role === "staff" && isBlocked(pathname, STAFF_BLOCKED)) {
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

  // ── 6. 캐시 미스였으면 응답 쿠키에 프로필 캐싱 ──
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
