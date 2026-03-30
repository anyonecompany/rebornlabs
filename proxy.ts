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

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createMiddlewareClient(request, response);

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // profiles 조회 (service_role, 1회) — 결과를 헤더로 전달하여 layout 중복 조회 제거
  const serviceClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { data: profile, error: profileError } = await serviceClient
    .from("profiles")
    .select("name, role, email, is_active, must_change_password")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    return NextResponse.redirect(new URL("/unauthorized", request.url));
  }

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

  // profile 데이터를 request 헤더에 주입 → layout에서 DB 조회 없이 읽기
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
