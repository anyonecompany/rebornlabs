import { NextRequest, NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/server";
import { verifyUser, AuthError, getAuthErrorMessage } from "@/lib/auth/verify";
import { escapeLike } from "@/src/lib/escape-like";

// ─── 헬퍼 ────────────────────────────────────────────────────

function extractToken(request: NextRequest): string {
  const authHeader = request.headers.get("Authorization") ?? "";
  return authHeader.replace(/^Bearer\s+/i, "");
}

function buildPublicUrl(request: NextRequest, token: string): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ??
    request.headers.get("origin") ??
    `${request.nextUrl.protocol}//${request.nextUrl.host}`;
  return `${base.replace(/\/$/, "")}/quote/${token}`;
}

type ScopeRole = "admin" | "staff" | "dealer" | "director" | "team_leader";

function isScopeRole(role: string): role is ScopeRole {
  return (
    role === "admin" ||
    role === "staff" ||
    role === "dealer" ||
    role === "director" ||
    role === "team_leader"
  );
}

// ─── GET /api/quotes — 내 견적서 목록 ─────────────────────────
//
// - dealer: 본인 생성 견적
// - admin/staff: 전체
// - director/team_leader: 산하 딜러 견적 (get_subordinate_ids RPC)
//
// Query: status=active|expired|all, search=string, page=1, pageSize=20

export async function GET(request: NextRequest) {
  try {
    const token = extractToken(request);
    const user = await verifyUser(token);

    const role = user.role as string;
    if (!isScopeRole(role)) {
      return NextResponse.json(
        { error: "견적서 조회 권한이 없습니다." },
        { status: 403 },
      );
    }

    const { searchParams } = new URL(request.url);
    const status = (searchParams.get("status") ?? "all") as
      | "active"
      | "expired"
      | "all";
    const search = (searchParams.get("search") ?? "").trim();
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const pageSize = Math.min(
      100,
      Math.max(1, Number(searchParams.get("pageSize") ?? 20)),
    );

    const serviceClient = createServiceClient();

    // 범위 필터용 dealer_id 배열 결정
    let dealerIdFilter: string[] | null = null;
    if (role === "dealer") {
      dealerIdFilter = [user.id];
    } else if (role === "director" || role === "team_leader") {
      // get_subordinate_ids RPC로 본인 + 1·2단계 하위 조회
      // RPC 미등록 시 폴백: 본인 ID만
      type SubResult = { get_subordinate_ids: string } | string;
      const { data: subData, error: subError } = await serviceClient.rpc(
        "get_subordinate_ids" as never,
        { p_user_id: user.id } as never,
      );
      if (subError || !subData) {
        dealerIdFilter = [user.id];
      } else {
        const rows = subData as unknown as SubResult[];
        dealerIdFilter = rows.map((r) =>
          typeof r === "string"
            ? r
            : (r as { get_subordinate_ids: string }).get_subordinate_ids,
        );
        if (dealerIdFilter.length === 0) dealerIdFilter = [user.id];
      }
    }

    // 차량명 검색이 있을 때 vehicles 쿼리로 vehicle_id 범위 확보
    let vehicleIdFilter: string[] | null = null;
    if (search) {
      // 견적번호 매칭이 아닌 경우에만 vehicles에서도 조회. 일단 둘 다 조회 후 union.
      const { data: vehicles } = await serviceClient
        .from("vehicles")
        .select("id, make, model, vehicle_code")
        .or(
          `make.ilike.%${escapeLike(search)}%,model.ilike.%${escapeLike(search)}%,vehicle_code.ilike.%${escapeLike(search)}%`,
        )
        .is("deleted_at", null)
        .limit(200);
      vehicleIdFilter = (vehicles ?? []).map((v) => v.id);
    }

    // 메인 쿼리 빌더
    let query = serviceClient
      .from("quotes")
      .select(
        `
          id, token, quote_number, expires_at, view_count,
          first_viewed_at, last_viewed_at, created_at,
          vehicle:vehicles!inner (
            id, vehicle_code, make, model, photos, deleted_at
          ),
          dealer:profiles!dealer_id (
            id, name
          )
        `,
        { count: "exact" },
      )
      .order("created_at", { ascending: false });

    if (dealerIdFilter) {
      query = query.in("dealer_id", dealerIdFilter);
    }

    if (status === "active") {
      const nowIso = new Date().toISOString();
      query = query.or(`expires_at.is.null,expires_at.gt.${nowIso}`);
    } else if (status === "expired") {
      const nowIso = new Date().toISOString();
      query = query.lte("expires_at", nowIso);
    }

    if (search) {
      // 견적번호 부분 일치 OR 차량 매칭 vehicle_id
      const clauses = [`quote_number.ilike.%${escapeLike(search)}%`];
      if (vehicleIdFilter && vehicleIdFilter.length > 0) {
        clauses.push(`vehicle_id.in.(${vehicleIdFilter.join(",")})`);
      }
      query = query.or(clauses.join(","));
    }

    const offset = (page - 1) * pageSize;
    query = query.range(offset, offset + pageSize - 1);

    const { data, count, error } = await query;

    if (error) {
      return NextResponse.json(
        { error: "견적 목록을 불러오지 못했습니다." },
        { status: 500 },
      );
    }

    const nowMs = Date.now();
    const quotes = (data ?? []).map((row) => {
      const vehicle = (Array.isArray(row.vehicle) ? row.vehicle[0] : row.vehicle) as
        | {
            id: string;
            vehicle_code: string;
            make: string;
            model: string;
            photos: string[] | null;
            deleted_at: string | null;
          }
        | null;

      const dealer = (Array.isArray(row.dealer) ? row.dealer[0] : row.dealer) as
        | { id: string; name: string }
        | null;

      const expiresAt = row.expires_at;
      const isExpired =
        !!expiresAt && new Date(expiresAt).getTime() <= nowMs;

      const canEdit =
        role === "admin" ||
        role === "staff" ||
        (role === "dealer" && dealer?.id === user.id);

      return {
        id: row.id,
        token: row.token,
        quoteNumber: row.quote_number,
        createdAt: row.created_at,
        expiresAt,
        viewCount: row.view_count ?? 0,
        firstViewedAt: row.first_viewed_at,
        lastViewedAt: row.last_viewed_at,
        status: isExpired ? ("expired" as const) : ("active" as const),
        vehicle: vehicle
          ? {
              id: vehicle.id,
              vehicleCode: vehicle.vehicle_code,
              make: vehicle.make,
              model: vehicle.model,
              primaryImageUrl: vehicle.photos?.[0] ?? null,
            }
          : null,
        dealer: dealer ? { id: dealer.id, name: dealer.name } : null,
        url: buildPublicUrl(request, row.token),
        canExtend: canEdit,
      };
    });

    const total = count ?? quotes.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    return NextResponse.json({
      quotes,
      total,
      page,
      pageSize,
      totalPages,
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
