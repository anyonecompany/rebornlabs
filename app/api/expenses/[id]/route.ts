import { NextRequest, NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/server";
import { verifyUser, requireRole, AuthError, getAuthErrorMessage } from "@/lib/auth/verify";
// admin-only 작업 — 별도 capability 추가 시 requireCapability로 전환

// ─── 헬퍼: Authorization 헤더에서 토큰 추출 ───────────────────

function extractToken(request: NextRequest): string {
  const authHeader = request.headers.get("Authorization") ?? "";
  return authHeader.replace(/^Bearer\s+/i, "");
}

// ─── DELETE /api/expenses/[id] — 지출 삭제 ───────────────────

/**
 * 지출 삭제 (admin 전용).
 *
 * - admin만 삭제 가능 (staff 차단)
 * - service_role로 실제 DELETE 처리
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const token = extractToken(request);
    const user = await verifyUser(token);
    requireRole(user, ["admin"]);

    const { id } = await params;

    const serviceClient = createServiceClient();

    // 존재 여부 확인
    const { data: existing, error: fetchError } = await serviceClient
      .from("expenses")
      .select("id")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: "지출 내역을 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    const { error: deleteError } = await serviceClient
      .from("expenses")
      .delete()
      .eq("id", id);

    if (deleteError) {
      return NextResponse.json(
        { error: "지출 삭제에 실패했습니다." },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true }, { status: 200 });
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
