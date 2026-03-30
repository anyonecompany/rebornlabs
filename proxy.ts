import { NextRequest, NextResponse } from "next/server";
import { createMiddlewareClient } from "@/lib/supabase/middleware";
import type { UserRole } from "@/types/database";

const DEALER_BLOCKED = ["/settlements", "/expenses", "/documents", "/users", "/audit-logs"];
const STAFF_BLOCKED = ["/users", "/audit-logs"];

function isBlocked(pathname: string, blockedPaths: string[]): boolean {
  return blockedPaths.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

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

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, is_active, must_change_password")
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

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
