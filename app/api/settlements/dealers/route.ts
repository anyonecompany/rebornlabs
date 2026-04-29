import { NextRequest, NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/server";
import { verifyUser, requireRole, AuthError, getAuthErrorMessage } from "@/lib/auth/verify";

// ─── 헬퍼: Authorization 헤더에서 토큰 추출 ───────────────────

function extractToken(request: NextRequest): string {
  const authHeader = request.headers.get("Authorization") ?? "";
  return authHeader.replace(/^Bearer\s+/i, "");
}

// ─── 헬퍼: 이번 달 기본 날짜 범위 계산 ──────────────────────

function getDefaultDateRange(): { startDate: string; endDate: string } {
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .split("T")[0];
  const endDate = now.toISOString().split("T")[0];
  return { startDate, endDate };
}

// ─── 타입 정의 ────────────────────────────────────────────────

interface DealerSettlement {
  dealer_id: string;
  dealer_name: string | null;
  total_count: number;
  db_provided_count: number;
  self_count: number;
  total_dealer_fee: number;
}

// ─── GET /api/settlements/dealers — 딜러별 정산 ───────────────

/**
 * 딜러별 정산 집계.
 *
 * - admin/staff 전용
 * - query params: start_date (YYYY-MM-DD), end_date (YYYY-MM-DD), dealer_id (optional)
 * - 기본 기간: 이번 달 1일 ~ 오늘
 * - 취소된 판매(cancelled_at IS NOT NULL) 제외
 * - 딜러 수당 합계 높은 순 정렬
 */
export async function GET(request: NextRequest) {
  try {
    const token = extractToken(request);
    const user = await verifyUser(token);
    requireRole(user, ["admin", "staff", "director", "team_leader"]);

    const { searchParams } = new URL(request.url);
    const defaults = getDefaultDateRange();
    const startDate = searchParams.get("start_date") ?? defaults.startDate;
    const endDate = searchParams.get("end_date") ?? defaults.endDate;
    const dealerIdFilter = searchParams.get("dealer_id");

    // end_date + 1일 (해당 날짜 포함을 위해 다음날 자정 미만으로 조회)
    const endDateExclusive = new Date(endDate);
    endDateExclusive.setDate(endDateExclusive.getDate() + 1);
    const endDateStr = endDateExclusive.toISOString().split("T")[0];

    const serviceClient = createServiceClient();

    // sales 전체 조회 (필터 적용) — Supabase JS에서 GROUP BY 미지원이므로 JS에서 집계
    let query = serviceClient
      .from("sales")
      .select("id, dealer_id, is_db_provided, dealer_fee, cancelled_at, created_at")
      .is("cancelled_at", null)
      .gte("created_at", startDate)
      .lt("created_at", endDateStr);

    if (dealerIdFilter) {
      query = query.eq("dealer_id", dealerIdFilter);
    }

    const { data: sales, error: salesError } = await query;
    if (salesError) {
      return NextResponse.json(
        { error: "정산 데이터를 불러오지 못했습니다." },
        { status: 500 },
      );
    }

    if (!sales || sales.length === 0) {
      return NextResponse.json({ data: [] });
    }

    // 딜러 이름 조회
    const dealerIds = [...new Set(sales.map((s) => s.dealer_id))];
    const { data: profiles, error: profilesError } = await serviceClient
      .from("profiles")
      .select("id, name")
      .in("id", dealerIds);

    if (profilesError) {
      return NextResponse.json(
        { error: "딜러 정보를 불러오지 못했습니다." },
        { status: 500 },
      );
    }

    const dealerNameMap = new Map(
      (profiles ?? []).map((p) => [p.id, p.name]),
    );

    // JS reduce로 딜러별 집계
    const settlementMap = new Map<string, DealerSettlement>();

    for (const sale of sales) {
      const existing = settlementMap.get(sale.dealer_id);
      if (existing) {
        existing.total_count += 1;
        if (sale.is_db_provided) {
          existing.db_provided_count += 1;
        } else {
          existing.self_count += 1;
        }
        existing.total_dealer_fee += sale.dealer_fee;
      } else {
        settlementMap.set(sale.dealer_id, {
          dealer_id: sale.dealer_id,
          dealer_name: dealerNameMap.get(sale.dealer_id) ?? null,
          total_count: 1,
          db_provided_count: sale.is_db_provided ? 1 : 0,
          self_count: sale.is_db_provided ? 0 : 1,
          total_dealer_fee: sale.dealer_fee,
        });
      }
    }

    // 수당 높은 순 정렬
    const result = Array.from(settlementMap.values()).sort(
      (a, b) => b.total_dealer_fee - a.total_dealer_fee,
    );

    return NextResponse.json({ data: result });
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
