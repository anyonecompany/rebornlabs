import { NextRequest, NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/server";
import { verifyUser, requireCapability, AuthError, getAuthErrorMessage } from "@/lib/auth/verify";

// ─── 헬퍼 ────────────────────────────────────────────────────

function extractToken(request: NextRequest): string {
  const authHeader = request.headers.get("Authorization") ?? "";
  return authHeader.replace(/^Bearer\s+/i, "");
}

// ─── GET /api/consultations/dealers — 딜러 목록 ───────────────

/**
 * 배정 가능한 딜러 목록 조회 (admin/staff 전용).
 *
 * dealer/team_leader/director 역할 모두 배정 대상에 포함한다.
 * 응답에 role 필드를 함께 반환하여 UI에서 역할 표시 가능.
 */
export async function GET(request: NextRequest) {
  try {
    const token = extractToken(request);
    const user = await verifyUser(token);
    requireCapability(user, "users:read");

    const serviceClient = createServiceClient();

    // dealer + team_leader + director 모두 영업 라인이므로 배정 가능
    const { data, error } = await serviceClient
      .from("profiles")
      .select("id, name, role")
      .in("role", ["dealer", "team_leader", "director"])
      .eq("is_active", true)
      .order("role", { ascending: true })
      .order("name", { ascending: true });

    if (error) {
      return NextResponse.json(
        { error: "딜러 목록을 불러오지 못했습니다." },
        { status: 500 },
      );
    }

    return NextResponse.json({ data: data ?? [] });
  } catch (err) {
    if (err instanceof AuthError) {
      const status =
        err.code === "NO_TOKEN" || err.code === "INVALID_TOKEN" ? 401 : 403;
      return NextResponse.json({ error: getAuthErrorMessage(err.code) }, { status });
    }
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
