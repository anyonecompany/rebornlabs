import { NextRequest, NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/server";
import { verifyUser, requireRole, AuthError, getAuthErrorMessage } from "@/lib/auth/verify";

// ─── 헬퍼: Authorization 헤더에서 토큰 추출 ───────────────────

function extractToken(request: NextRequest): string {
  const authHeader = request.headers.get("Authorization") ?? "";
  return authHeader.replace(/^Bearer\s+/i, "");
}

// ─── GET /api/dashboard/recent — 최근 항목 ───────────────────

/**
 * 대시보드 최근 항목 조회 (admin/staff 전용).
 *
 * - 최근 상담 5건: consultations ORDER BY created_at DESC LIMIT 5
 * - 최근 판매 5건: sales WHERE cancelled_at IS NULL ORDER BY created_at DESC LIMIT 5
 * - 병렬 조회로 응답 속도 최적화
 */
export async function GET(request: NextRequest) {
  try {
    const token = extractToken(request);
    const user = await verifyUser(token);
    requireRole(user, ["admin", "staff"]);

    const serviceClient = createServiceClient();

    // 최근 상담 5건 + 최근 판매 5건 병렬 조회
    const [consultationsResult, salesResult] = await Promise.all([
      serviceClient
        .from("consultations")
        .select(
          "id, customer_name, phone, interested_vehicle, status, assigned_dealer_id, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(5),
      serviceClient
        .from("sales")
        .select(
          "id, consultation_id, vehicle_id, dealer_id, is_db_provided, dealer_fee, marketing_fee, created_at",
        )
        .is("cancelled_at", null)
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

    if (consultationsResult.error) {
      return NextResponse.json(
        { error: "최근 상담 목록을 불러오지 못했습니다." },
        { status: 500 },
      );
    }

    if (salesResult.error) {
      return NextResponse.json(
        { error: "최근 판매 목록을 불러오지 못했습니다." },
        { status: 500 },
      );
    }

    const recentSales = salesResult.data ?? [];

    // 판매 데이터에 차량 코드 + 딜러 이름 병렬 조회
    if (recentSales.length > 0) {
      const vehicleIds = [...new Set(recentSales.map((s) => s.vehicle_id))];
      const dealerIds = [...new Set(recentSales.map((s) => s.dealer_id))];

      const [vehiclesResult, dealersResult] = await Promise.all([
        serviceClient
          .from("vehicles")
          .select("id, vehicle_code, make, model")
          .in("id", vehicleIds),
        serviceClient
          .from("profiles")
          .select("id, name")
          .in("id", dealerIds),
      ]);

      const vehicleMap = new Map(
        (vehiclesResult.data ?? []).map((v) => [v.id, v]),
      );
      const dealerMap = new Map(
        (dealersResult.data ?? []).map((d) => [d.id, d]),
      );

      const mergedSales = recentSales.map((sale) => {
        const vehicle = vehicleMap.get(sale.vehicle_id);
        const dealer = dealerMap.get(sale.dealer_id);
        return {
          ...sale,
          vehicle_code: vehicle?.vehicle_code ?? null,
          vehicle_make: vehicle?.make ?? null,
          vehicle_model: vehicle?.model ?? null,
          dealer_name: dealer?.name ?? null,
        };
      });

      return NextResponse.json({
        recentConsultations: consultationsResult.data ?? [],
        recentSales: mergedSales,
      });
    }

    return NextResponse.json({
      recentConsultations: consultationsResult.data ?? [],
      recentSales: [],
    });
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
