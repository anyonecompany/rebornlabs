import { NextRequest, NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/server";
import { verifyUser, requireRole, AuthError, getAuthErrorMessage} from "@/lib/auth/verify";

// ─── 헬퍼 ────────────────────────────────────────────────────

function extractToken(request: NextRequest): string {
  const authHeader = request.headers.get("Authorization") ?? "";
  return authHeader.replace(/^Bearer\s+/i, "");
}

// ─── GET /api/consultations/dealers — 딜러 목록 ───────────────

/**
 * 배정 가능한 딜러 목록 조회 (admin/staff 전용).
 *
 * dealers_name_view에서 id, name만 반환한다.
 * 민감 정보(email, phone, is_active)는 뷰에서 제외됨.
 */
export async function GET(request: NextRequest) {
  try {
    const token = extractToken(request);
    const user = await verifyUser(token);
    requireRole(user, ["admin", "staff"]);

    const serviceClient = createServiceClient();

    // dealers_name_view는 user_role() 함수에 의존하여 service_role에서 빈 결과 반환
    // profiles 테이블에서 직접 조회 (service_role → RLS 우회)
    const { data, error } = await serviceClient
      .from("profiles")
      .select("id, name")
      .eq("role", "dealer")
      .eq("is_active", true)
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
