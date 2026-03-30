import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { verifyUser, requireRole, AuthError } from "@/lib/auth/verify";

function extractToken(request: NextRequest): string {
  const authHeader = request.headers.get("Authorization") ?? "";
  const bearer = authHeader.replace(/^Bearer\s+/i, "");
  if (bearer) return bearer;
  return request.cookies.get("sb-access-token")?.value ?? "";
}

/**
 * GET /api/users
 * 전체 사용자 목록 조회 (admin 전용)
 * query: roles (optional, comma-separated) — 특정 역할만 필터
 */
export async function GET(request: NextRequest) {
  try {
    const token = extractToken(request);
    const user = await verifyUser(token);
    requireRole(user, ["admin", "staff"]);

    const serviceClient = createServiceClient();

    const { searchParams } = new URL(request.url);
    const rolesParam = searchParams.get("roles");

    let query = serviceClient
      .from("profiles")
      .select("id, email, name, phone, role, is_active, created_at")
      .order("created_at", { ascending: false });

    if (rolesParam) {
      const roles = rolesParam.split(",").map((r) => r.trim()) as ("admin" | "staff" | "dealer" | "pending")[];
      query = query.in("role", roles);
    }

    const { data: users, error: usersError } = await query;

    if (usersError) {
      return NextResponse.json(
        { error: "사용자 목록을 불러오지 못했습니다." },
        { status: 500 },
      );
    }

    return NextResponse.json({ users, data: users });
  } catch (err) {
    if (err instanceof AuthError) {
      const status = err.code === "NO_TOKEN" || err.code === "INVALID_TOKEN" ? 401 : 403;
      return NextResponse.json({ error: err.message }, { status });
    }
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
