import { NextRequest, NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/server";
import { verifyUser, AuthError, getAuthErrorMessage} from "@/lib/auth/verify";

// ─── 헬퍼: Authorization 헤더에서 토큰 추출 ───────────────────

function extractToken(request: NextRequest): string {
  const authHeader = request.headers.get("Authorization") ?? "";
  return authHeader.replace(/^Bearer\s+/i, "");
}

// ─── 타입 정의 ────────────────────────────────────────────────

/** admin/staff 대시보드 통계 */
interface AdminDashboardStats {
  available_vehicles: number;
  new_consultations: number;
  month_sales: number;
  month_dealer_fees: number;
  month_marketing_fees: number;
}

/** dealer 대시보드 통계 */
interface DealerDashboardStats {
  my_active_consultations: number;
  available_vehicles: number;
  my_month_sales: number;
}

type DashboardStats = AdminDashboardStats | DealerDashboardStats;

// ─── GET /api/dashboard — 대시보드 통계 ──────────────────────

/**
 * 역할별 대시보드 통계.
 *
 * - 인증 필수 (admin/staff/dealer 모두 접근 가능)
 * - get_dashboard_stats RPC 호출 (service_role)
 * - admin/staff: 전체 현황 (재고, 신규상담, 이달 판매수/딜러수당/마케팅수수료)
 * - dealer: 개인 현황 (담당 활성상담, 가용재고, 이달 개인판매수)
 */
export async function GET(request: NextRequest) {
  try {
    const token = extractToken(request);
    const user = await verifyUser(token);

    const serviceClient = createServiceClient();

    const { data, error } = await serviceClient.rpc("get_dashboard_stats", {
      p_user_id: user.id,
      p_role: user.role,
    });

    if (error) {
      return NextResponse.json(
        { error: "대시보드 통계를 불러오지 못했습니다." },
        { status: 500 },
      );
    }

    return NextResponse.json({ data: data as DashboardStats });
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
