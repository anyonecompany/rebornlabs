import { NextRequest, NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/server";
import { verifyUser, requireRole, AuthError } from "@/lib/auth/verify";

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

interface MarketingSettlement {
  marketing_company: string | null;
  count: number;
  total_marketing_fee: number;
}

// ─── GET /api/settlements/marketing — 마케팅업체별 정산 ────────

/**
 * 마케팅업체별 정산 집계.
 *
 * - admin/staff 전용
 * - query params: start_date (YYYY-MM-DD), end_date (YYYY-MM-DD), company (optional)
 * - 기본 기간: 이번 달 1일 ~ 오늘
 * - is_db_provided=true 건만 집계 (딜러 직접 영업 제외)
 * - 취소된 판매(cancelled_at IS NOT NULL) 제외
 * - marketing_company는 연결된 consultations 테이블에서 조회
 * - 수수료 합계 높은 순 정렬
 */
export async function GET(request: NextRequest) {
  try {
    const token = extractToken(request);
    const user = await verifyUser(token);
    requireRole(user, ["admin", "staff"]);

    const { searchParams } = new URL(request.url);
    const defaults = getDefaultDateRange();
    const startDate = searchParams.get("start_date") ?? defaults.startDate;
    const endDate = searchParams.get("end_date") ?? defaults.endDate;
    const companyFilter = searchParams.get("company");

    // end_date + 1일 (해당 날짜 포함)
    const endDateExclusive = new Date(endDate);
    endDateExclusive.setDate(endDateExclusive.getDate() + 1);
    const endDateStr = endDateExclusive.toISOString().split("T")[0];

    const serviceClient = createServiceClient();

    // 1단계: is_db_provided=true인 sales 조회
    const { data: sales, error: salesError } = await serviceClient
      .from("sales")
      .select("id, consultation_id, marketing_fee, cancelled_at, created_at")
      .is("cancelled_at", null)
      .eq("is_db_provided", true)
      .gte("created_at", startDate)
      .lt("created_at", endDateStr);

    if (salesError) {
      return NextResponse.json(
        { error: "정산 데이터를 불러오지 못했습니다." },
        { status: 500 },
      );
    }

    if (!sales || sales.length === 0) {
      return NextResponse.json({ data: [] });
    }

    // 2단계: consultation_ids 수집 → consultations에서 marketing_company 조회
    const consultationIds = [
      ...new Set(
        sales
          .map((s) => s.consultation_id)
          .filter((id): id is string => id !== null),
      ),
    ];

    let marketingCompanyMap = new Map<string, string | null>();

    if (consultationIds.length > 0) {
      const { data: consultations, error: consultError } = await serviceClient
        .from("consultations")
        .select("id, marketing_company")
        .in("id", consultationIds);

      if (consultError) {
        return NextResponse.json(
          { error: "상담 정보를 불러오지 못했습니다." },
          { status: 500 },
        );
      }

      marketingCompanyMap = new Map(
        (consultations ?? []).map((c) => [c.id, c.marketing_company]),
      );
    }

    // 3단계: JS로 marketing_company별 집계
    const settlementMap = new Map<string, MarketingSettlement>();

    for (const sale of sales) {
      const company = sale.consultation_id
        ? (marketingCompanyMap.get(sale.consultation_id) ?? null)
        : null;

      // company 필터 적용
      if (companyFilter && company !== companyFilter) {
        continue;
      }

      const mapKey = company ?? "__null__";
      const existing = settlementMap.get(mapKey);

      if (existing) {
        existing.count += 1;
        existing.total_marketing_fee += sale.marketing_fee;
      } else {
        settlementMap.set(mapKey, {
          marketing_company: company,
          count: 1,
          total_marketing_fee: sale.marketing_fee,
        });
      }
    }

    // 수수료 높은 순 정렬
    const result = Array.from(settlementMap.values()).sort(
      (a, b) => b.total_marketing_fee - a.total_marketing_fee,
    );

    return NextResponse.json({ data: result });
  } catch (err) {
    if (err instanceof AuthError) {
      const status =
        err.code === "NO_TOKEN" || err.code === "INVALID_TOKEN" ? 401 : 403;
      return NextResponse.json({ error: err.message }, { status });
    }
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
