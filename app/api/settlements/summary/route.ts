import { NextRequest, NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/server";
import { verifyUser, requireRole, AuthError, getAuthErrorMessage} from "@/lib/auth/verify";

// ─── 헬퍼: Authorization 헤더에서 토큰 추출 ───────────────────

function extractToken(request: NextRequest): string {
  const authHeader = request.headers.get("Authorization") ?? "";
  return authHeader.replace(/^Bearer\s+/i, "");
}

// ─── 타입 정의 ────────────────────────────────────────────────

interface MonthlySummary {
  month: string;
  total_sales: number;
  total_dealer_fees: number;
  total_marketing_fees: number;
  total_cost: number;
}

// ─── GET /api/settlements/summary — 월별 정산 요약 ────────────

/**
 * 월별 정산 요약.
 *
 * - admin/staff 전용
 * - query params: month (YYYY-MM, 기본 이번 달)
 * - 취소된 판매(cancelled_at IS NOT NULL) 제외
 * - total_cost = total_dealer_fees + total_marketing_fees
 */
export async function GET(request: NextRequest) {
  try {
    const token = extractToken(request);
    const user = await verifyUser(token);
    requireRole(user, ["admin", "staff"]);

    const { searchParams } = new URL(request.url);

    // 이번 달 기본값: YYYY-MM 형식
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const month = searchParams.get("month") ?? currentMonth;

    // YYYY-MM → 월 시작일 / 다음 달 시작일 계산
    const [yearStr, monthStr] = month.split("-");
    const year = parseInt(yearStr, 10);
    const monthNum = parseInt(monthStr, 10);

    if (isNaN(year) || isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
      return NextResponse.json(
        { error: "올바른 월 형식이 아닙니다. YYYY-MM 형식으로 입력하세요." },
        { status: 400 },
      );
    }

    const startDate = `${year}-${String(monthNum).padStart(2, "0")}-01`;
    // 다음 달 1일 (해당 월 전체 포함)
    const nextMonth = monthNum === 12 ? 1 : monthNum + 1;
    const nextYear = monthNum === 12 ? year + 1 : year;
    const endDateStr = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;

    const serviceClient = createServiceClient();

    // 해당 월의 취소되지 않은 판매 전체 조회
    const { data: sales, error: salesError } = await serviceClient
      .from("sales")
      .select("id, dealer_fee, marketing_fee, cancelled_at, created_at")
      .is("cancelled_at", null)
      .gte("created_at", startDate)
      .lt("created_at", endDateStr);

    if (salesError) {
      return NextResponse.json(
        { error: "정산 데이터를 불러오지 못했습니다." },
        { status: 500 },
      );
    }

    // JS로 집계
    const total_sales = sales?.length ?? 0;
    const total_dealer_fees = (sales ?? []).reduce(
      (sum, s) => sum + s.dealer_fee,
      0,
    );
    const total_marketing_fees = (sales ?? []).reduce(
      (sum, s) => sum + s.marketing_fee,
      0,
    );

    const summary: MonthlySummary = {
      month,
      total_sales,
      total_dealer_fees,
      total_marketing_fees,
      total_cost: total_dealer_fees + total_marketing_fees,
    };

    return NextResponse.json({ data: summary });
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
