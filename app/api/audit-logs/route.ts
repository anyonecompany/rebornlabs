import { NextRequest, NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/server";
import { verifyUser, requireRole, AuthError, getAuthErrorMessage} from "@/lib/auth/verify";

// ─── 헬퍼: Authorization 헤더에서 토큰 추출 ───────────────────

function extractToken(request: NextRequest): string {
  const authHeader = request.headers.get("Authorization") ?? "";
  return authHeader.replace(/^Bearer\s+/i, "");
}

// ─── GET /api/audit-logs — 감사 로그 목록 조회 ───────────────

/**
 * 감사 로그 목록 조회 (admin 전용, 커서 기반 페이지네이션).
 *
 * - admin만 접근 가능
 * - query: action (optional 필터)
 * - 커서: "created_at__id" 형식, 20건씩
 * - actor_id nullable이므로 null이면 "시스템"으로 표시
 * - 응답: { data: AuditLog[], nextCursor: string|null }
 */
export async function GET(request: NextRequest) {
  try {
    const token = extractToken(request);
    const user = await verifyUser(token);
    requireRole(user, ["admin"]);

    const { searchParams } = new URL(request.url);
    const cursor = searchParams.get("cursor"); // 레거시 호환
    const actionParam = searchParams.get("action");

    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const pageSize = Math.min(
      100,
      Math.max(1, Number(searchParams.get("pageSize") ?? 20)),
    );

    const serviceClient = createServiceClient();

    let query = serviceClient
      .from("audit_logs")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });

    if (cursor) {
      query = query.limit(pageSize + 1);
    } else {
      const offset = (page - 1) * pageSize;
      query = query.range(offset, offset + pageSize - 1);
    }

    // action 필터 (값이 있는 경우에만 적용)
    if (actionParam) {
      query = query.eq("action", actionParam);
    }

    // 커서 페이지네이션
    if (cursor) {
      const [cursorDate, cursorId] = cursor.split("__");
      if (cursorDate && cursorId) {
        query = query.or(
          `created_at.lt.${cursorDate},and(created_at.eq.${cursorDate},id.lt.${cursorId})`,
        );
      }
    }

    const { data: logs, error: listError, count } = await query;
    if (listError) {
      return NextResponse.json(
        { error: "감사 로그를 불러오지 못했습니다." },
        { status: 500 },
      );
    }

    const total = count ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const hasMore = cursor ? (logs?.length ?? 0) > pageSize : false;
    const items = cursor && hasMore ? logs!.slice(0, pageSize) : (logs ?? []);

    if (items.length === 0) {
      return NextResponse.json({
        data: [],
        total,
        page,
        pageSize,
        totalPages,
        nextCursor: null,
      });
    }

    // actor 이름 join (null 제외)
    const actorIds = [
      ...new Set(
        items.map((l) => l.actor_id).filter((id): id is string => id !== null),
      ),
    ];

    const profileMap = new Map<string, string>();
    if (actorIds.length > 0) {
      const { data: profiles } = await serviceClient
        .from("profiles")
        .select("id, name")
        .in("id", actorIds);

      (profiles ?? []).forEach((p) => profileMap.set(p.id, p.name));
    }

    const merged = items.map((log) => ({
      ...log,
      // actor_id가 null이면 "시스템", 있으면 프로필 이름 (없으면 "(알 수 없음)")
      actor_name: log.actor_id
        ? (profileMap.get(log.actor_id) ?? "(알 수 없음)")
        : "시스템",
    }));

    const lastItem = items[items.length - 1];
    const nextCursor =
      cursor && hasMore && lastItem
        ? `${lastItem.created_at}__${lastItem.id}`
        : null;

    return NextResponse.json({
      data: merged,
      total,
      page,
      pageSize,
      totalPages,
      nextCursor,
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
