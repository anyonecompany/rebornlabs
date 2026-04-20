import { NextRequest, NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/server";
import { verifyUser, AuthError } from "@/lib/auth/verify";
import type { ConsultationStatus } from "@/types/database";

// ─── 헬퍼 ────────────────────────────────────────────────────

function extractToken(request: NextRequest): string {
  const authHeader = request.headers.get("Authorization") ?? "";
  return authHeader.replace(/^Bearer\s+/i, "");
}

// ─── GET /api/consultations — 상담 목록 ──────────────────────

/**
 * 상담 목록 조회 (커서 기반 페이지네이션).
 *
 * - admin/staff: 전체 상담 조회
 * - dealer: 본인 배정된 상담만 조회 (assigned_dealer_id 필터)
 * - 페이지 크기: 20건
 * - 커서: "created_at__id" 형식
 * - 검색: customer_name, phone (ilike)
 * - 필터: status, is_duplicate
 */
export async function GET(request: NextRequest) {
  try {
    const token = extractToken(request);
    const user = await verifyUser(token);

    const { searchParams } = new URL(request.url);
    const cursor = searchParams.get("cursor");
    const search = searchParams.get("search") ?? "";
    const status = searchParams.get("status") ?? "";
    const isDuplicate = searchParams.get("is_duplicate");
    const PAGE_SIZE = 20;

    const serviceClient = createServiceClient();

    let query = serviceClient
      .from("consultations")
      .select("*")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(PAGE_SIZE + 1);

    // dealer: 본인 배정 상담만
    if (user.role === "dealer") {
      query = query.eq("assigned_dealer_id", user.id);
    }

    // 검색 필터
    if (search) {
      query = query.or(
        `customer_name.ilike.%${search}%,phone.ilike.%${search}%`,
      );
    }

    // 상태 필터
    if (status) {
      query = query.eq("status", status as ConsultationStatus);
    }

    // 중복 필터
    if (isDuplicate === "true") {
      query = query.eq("is_duplicate", true);
    } else if (isDuplicate === "false") {
      query = query.eq("is_duplicate", false);
    }

    // 커서 기반 페이지네이션
    if (cursor) {
      const [cursorDate, cursorId] = cursor.split("__");
      if (cursorDate && cursorId) {
        query = query.or(
          `created_at.lt.${cursorDate},and(created_at.eq.${cursorDate},id.lt.${cursorId})`,
        );
      }
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json(
        { error: "상담 목록을 불러오지 못했습니다." },
        { status: 500 },
      );
    }

    const hasMore = (data?.length ?? 0) > PAGE_SIZE;
    const items = hasMore ? data!.slice(0, PAGE_SIZE) : (data ?? []);
    const lastItem = items[items.length - 1];
    const nextCursor =
      hasMore && lastItem ? `${lastItem.created_at}__${lastItem.id}` : null;

    // 배정 딜러 이름 병합 (profiles 별도 조회 → id → name 매핑)
    const dealerIds = [
      ...new Set(
        items
          .map((c) => c.assigned_dealer_id)
          .filter((v): v is string => v !== null),
      ),
    ];
    let dealerMap: Record<string, string> = {};
    if (dealerIds.length > 0) {
      const { data: dealers } = await serviceClient
        .from("profiles")
        .select("id, name")
        .in("id", dealerIds);
      dealerMap = Object.fromEntries(
        (dealers ?? []).map((d) => [d.id, d.name]),
      );
    }
    const itemsWithDealer = items.map((c) => ({
      ...c,
      assigned_dealer_name: c.assigned_dealer_id
        ? (dealerMap[c.assigned_dealer_id] ?? null)
        : null,
    }));

    return NextResponse.json({ data: itemsWithDealer, nextCursor });
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
