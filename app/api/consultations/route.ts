import { NextRequest, NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/server";
import { verifyUser, AuthError, getAuthErrorMessage } from "@/lib/auth/verify";
import { dataScope } from "@/lib/auth/capabilities";
import { fetchSubordinateIds } from "@/lib/auth/subordinate";
import { escapeLike } from "@/src/lib/escape-like";
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
    const cursor = searchParams.get("cursor"); // 레거시 호환
    const search = searchParams.get("search") ?? "";
    const status = searchParams.get("status") ?? "";
    const isDuplicate = searchParams.get("is_duplicate");
    const sourceCategory = searchParams.get("source_category") ?? "";

    // 페이지 번호 기반 페이지네이션 (cursor 미지정 시 기본).
    // page=1 부터 시작, pageSize 기본 20·최대 100.
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const pageSize = Math.min(
      100,
      Math.max(1, Number(searchParams.get("pageSize") ?? 20)),
    );

    const INSTAGRAM_ALIASES = ["ig", "instagram", "insta"];

    const serviceClient = createServiceClient();

    let query = serviceClient
      .from("consultations")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });

    // cursor 모드(레거시) — limit 만 사용. page 모드 — range 사용.
    if (cursor) {
      query = query.limit(pageSize + 1);
    } else {
      const offset = (page - 1) * pageSize;
      query = query.range(offset, offset + pageSize - 1);
    }

    // 역할별 조회 범위 — capabilities.ts SSOT 기반.
    //   all          : admin / staff (필터 없음)
    //   subordinate  : director / team_leader → 산하 dealer 배정 + 미배정 (운영 정책)
    //   self         : dealer (본인 배정만)
    //   none         : pending → 403
    //
    // service_role 키로 RLS 우회 중이므로 앱 레이어 명시 필터가 유일한 권한 경계다.
    const scope = dataScope(user.role, "consultations");
    if (scope === "none") {
      return NextResponse.json(
        { error: "이 작업을 수행할 권한이 없습니다." },
        { status: 403 },
      );
    }
    if (scope === "self") {
      query = query.eq("assigned_dealer_id", user.id);
    } else if (scope === "subordinate") {
      const subordinateIds = await fetchSubordinateIds(serviceClient, user.id);
      // manager 가시 범위: 산하 dealer 배정 상담 + 미배정 상담
      query = query.or(
        `assigned_dealer_id.in.(${subordinateIds.join(",")}),assigned_dealer_id.is.null`,
      );
    }
    // scope === "all" 인 경우 필터 없음

    // 검색 필터
    if (search) {
      query = query.or(
        `customer_name.ilike.%${escapeLike(search)}%,phone.ilike.%${escapeLike(search)}%`,
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

    // 유입 채널 필터
    //   direct    : source_ref IS NULL OR lower = 'direct'
    //   instagram : source_ref ∈ {ig, instagram, insta}
    //   other     : 나머지 (NULL/direct/인스타 별칭 제외)
    if (sourceCategory === "direct") {
      query = query.or("source_ref.is.null,source_ref.ilike.direct");
    } else if (sourceCategory === "instagram") {
      const aliases = INSTAGRAM_ALIASES.map((a) => `source_ref.ilike.${a}`).join(",");
      query = query.or(aliases);
    } else if (sourceCategory === "other") {
      query = query
        .not("source_ref", "is", null)
        .not("source_ref", "ilike", "direct");
      for (const alias of INSTAGRAM_ALIASES) {
        query = query.not("source_ref", "ilike", alias);
      }
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

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json(
        { error: "상담 목록을 불러오지 못했습니다." },
        { status: 500 },
      );
    }

    // page 모드 응답 메타
    const total = count ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    // cursor 모드(레거시) 호환 — slice + nextCursor
    const hasMore = cursor ? (data?.length ?? 0) > pageSize : false;
    const items = cursor && hasMore ? data!.slice(0, pageSize) : (data ?? []);
    const lastItem = items[items.length - 1];
    const nextCursor =
      cursor && hasMore && lastItem
        ? `${lastItem.created_at}__${lastItem.id}`
        : null;

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

    return NextResponse.json(
      {
        data: itemsWithDealer,
        total,
        page,
        pageSize,
        totalPages,
        nextCursor, // 레거시 호환
      },
      { headers: { "Cache-Control": "private, max-age=10, stale-while-revalidate=60" } },
    );
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
