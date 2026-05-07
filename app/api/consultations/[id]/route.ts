import { NextRequest, NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/server";
import { verifyUser, AuthError, getAuthErrorMessage } from "@/lib/auth/verify";
import { dataScope } from "@/lib/auth/capabilities";
import { fetchSubordinateIds, SUBORDINATE_ZERO_UUID as ZERO_UUID } from "@/lib/auth/subordinate";

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
 * 권한 매트릭스:
 *   - admin/staff:           모든 상담
 *   - director/team_leader:  get_subordinate_ids에 포함된 dealer의 상담만
 *   - dealer:                assigned_dealer_id === user.id
 *
 * 반환값:
 *   - data: 상담 기본 정보
 *   - history: 같은 전화번호 다른 상담 목록 (권한 매트릭스 동일 적용)
 *   - dealer: 배정 딜러 정보 (id, name) | null
 *   - logs: 상담 기록 목록 (최신순)
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const token = extractToken(request);
    const user = await verifyUser(token);

    const serviceClient = createServiceClient();

    // ── 역할별 데이터 스코프 (capabilities SSOT) ──────────────────
    //   all          : admin / staff
    //   subordinate  : director / team_leader (산하 + 미배정)
    //   self         : dealer
    //   none         : pending → 403
    const scope = dataScope(user.role, "consultations");
    if (scope === "none") {
      return NextResponse.json(
        { error: "접근 권한이 없습니다." },
        { status: 403 },
      );
    }

    // 산하 dealer 목록 (subordinate 스코프만 미리 조회)
    let subordinateIds: string[] | null = null;
    if (scope === "subordinate") {
      subordinateIds = await fetchSubordinateIds(serviceClient, user.id);
    }

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

    // ── 단건 접근 권한 검증 ──────────────────────────────────────
    if (scope === "self" && consultation.assigned_dealer_id !== user.id) {
      return NextResponse.json(
        { error: "접근 권한이 없습니다." },
        { status: 403 },
      );
    }
    if (scope === "subordinate") {
      const allowedIds = subordinateIds ?? [ZERO_UUID];
      const isAssignedToSubordinate =
        consultation.assigned_dealer_id !== null &&
        allowedIds.includes(consultation.assigned_dealer_id);
      const isUnassigned = consultation.assigned_dealer_id === null;
      if (!isAssignedToSubordinate && !isUnassigned) {
        return NextResponse.json(
          { error: "접근 권한이 없습니다." },
          { status: 403 },
        );
      }
    }
    // scope === "all" → 추가 필터 없음

    // ── 동일 고객 이력 조회 (같은 phone, 본인 제외) ──────────────
    // 동일 스코프 적용 — dealer는 본인 상담만, manager는 산하 상담만.
    let historyQuery = serviceClient
      .from("consultations")
      .select("id, customer_name, phone, status, created_at, source_ref, assigned_dealer_id")
      .eq("phone", consultation.phone)
      .neq("id", id)
      .order("created_at", { ascending: false });

    if (scope === "self") {
      historyQuery = historyQuery.eq("assigned_dealer_id", user.id);
    } else if (scope === "subordinate") {
      const ids = subordinateIds ?? [ZERO_UUID];
      historyQuery = historyQuery.or(
        `assigned_dealer_id.in.(${ids.join(",")}),assigned_dealer_id.is.null`,
      );
    }

    const { data: history } = await historyQuery;

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
      history: history ?? [],
      dealer,
      logs: logsWithName,
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
