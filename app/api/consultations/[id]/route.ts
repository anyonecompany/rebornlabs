import { NextRequest, NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/server";
import { verifyUser, AuthError } from "@/lib/auth/verify";

// ─── 헬퍼 ────────────────────────────────────────────────────

function extractToken(request: NextRequest): string {
  const authHeader = request.headers.get("Authorization") ?? "";
  return authHeader.replace(/^Bearer\s+/i, "");
}

type RouteContext = { params: Promise<{ id: string }> };

// ─── GET /api/consultations/[id] — 상담 상세 ─────────────────

/**
 * 상담 상세 조회.
 *
 * 반환값:
 *   - data: 상담 기본 정보
 *   - relatedConsultations: 같은 전화번호 다른 상담 목록
 *   - dealer: 배정 딜러 정보 (id, name) | null
 *   - logs: 상담 기록 목록 (최신순)
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const token = extractToken(request);
    const user = await verifyUser(token);

    const serviceClient = createServiceClient();

    // 상담 기본 정보 조회
    const { data: consultation, error: consultError } = await serviceClient
      .from("consultations")
      .select("*")
      .eq("id", id)
      .single();

    if (consultError || !consultation) {
      return NextResponse.json(
        { error: "상담을 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    // dealer인 경우 본인 배정 상담인지 확인
    if (
      user.role === "dealer" &&
      consultation.assigned_dealer_id !== user.id
    ) {
      return NextResponse.json(
        { error: "접근 권한이 없습니다." },
        { status: 403 },
      );
    }

    // 동일 고객 다른 상담 건 조회 (같은 phone, 본인 제외)
    const { data: relatedConsultations } = await serviceClient
      .from("consultations")
      .select("id, customer_name, phone, status, created_at, source_ref")
      .eq("phone", consultation.phone)
      .neq("id", id)
      .order("created_at", { ascending: false });

    // 배정 딜러 정보 조회
    let dealer: { id: string; name: string } | null = null;
    if (consultation.assigned_dealer_id) {
      const { data: dealerData } = await serviceClient
        .from("profiles")
        .select("id, name")
        .eq("id", consultation.assigned_dealer_id)
        .single();
      if (dealerData) {
        dealer = { id: dealerData.id, name: dealerData.name };
      }
    }

    // 상담 기록 조회 (오래된 순) + 작성자 이름 병합
    const { data: logs } = await serviceClient
      .from("consultation_logs")
      .select("*")
      .eq("consultation_id", id)
      .order("created_at", { ascending: true });

    const logDealerIds = [...new Set((logs ?? []).map((l) => l.dealer_id))];
    let logDealerMap: Record<string, string> = {};
    if (logDealerIds.length > 0) {
      const { data: logDealers } = await serviceClient
        .from("profiles")
        .select("id, name")
        .in("id", logDealerIds);
      logDealerMap = Object.fromEntries(
        (logDealers ?? []).map((d) => [d.id, d.name]),
      );
    }
    const logsWithName = (logs ?? []).map((l) => ({
      ...l,
      dealer_name: logDealerMap[l.dealer_id] ?? null,
    }));

    return NextResponse.json({
      data: consultation,
      relatedConsultations: relatedConsultations ?? [],
      dealer,
      logs: logsWithName,
    });
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
