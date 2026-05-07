import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createServiceClient } from "@/lib/supabase/server";
import { verifyUser, AuthError, getAuthErrorMessage } from "@/lib/auth/verify";

// ─── Zod 스키마 ───────────────────────────────────────────────

const CreateSaleSchema = z.object({
  consultation_id: z.string().uuid("올바른 UUID 형식이 아닙니다.").nullable().optional(),
  vehicle_id: z.string().uuid("차량 ID는 올바른 UUID 형식이어야 합니다."),
  dealer_id: z.string().uuid("딜러 ID는 올바른 UUID 형식이어야 합니다."),
  quote_id: z.string().uuid("견적서 ID는 올바른 UUID 형식이어야 합니다.").optional(), // P0-1: 만료 검증용
  is_db_provided: z.boolean({
    required_error: "DB 제공 여부는 필수입니다.",
    invalid_type_error: "DB 제공 여부는 boolean 값이어야 합니다.",
  }),
  dealer_fee: z.number().int().min(0).optional(),
  marketing_fee: z.number().int().min(0).optional(),
});

// ─── 헬퍼 ────────────────────────────────────────────────────

function extractToken(request: NextRequest): string {
  const authHeader = request.headers.get("Authorization") ?? "";
  return authHeader.replace(/^Bearer\s+/i, "");
}

// ─── GET /api/sales — 판매 목록 조회 ─────────────────────────

/**
 * 판매 목록 조회 (커서 기반 페이지네이션).
 *
 * - admin/staff: 전체 판매 목록
 * - dealer: 본인 판매 목록 (dealer_id = user.id)
 * - 커서: "created_at__id" 형식, 20건씩
 * - 필터: is_cancelled (true/false)
 */
export async function GET(request: NextRequest) {
  try {
    const token = extractToken(request);
    const user = await verifyUser(token);

    const { searchParams } = new URL(request.url);
    const cursor = searchParams.get("cursor"); // 레거시 호환
    const isCancelledParam = searchParams.get("is_cancelled");

    // 페이지 번호 기반 (cursor 미지정 시 기본).
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const pageSize = Math.min(
      100,
      Math.max(1, Number(searchParams.get("pageSize") ?? 20)),
    );

    const serviceClient = createServiceClient();

    // sales 조회
    let query = serviceClient
      .from("sales")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });

    if (cursor) {
      query = query.limit(pageSize + 1);
    } else {
      const offset = (page - 1) * pageSize;
      query = query.range(offset, offset + pageSize - 1);
    }

    // 역할별 조회 범위 필터
    //   dealer                  : 본인 건만 (dealer_id = user.id)
    //   director / team_leader  : 산하 딜러(get_subordinate_ids) 건만
    //   admin / staff           : 필터 없음 (전체 조회)
    //
    // service_role 키로 RLS를 우회하므로 앱 레이어 명시 필터가 유일한 권한 경계다.
    // RPC 실패 또는 산하 0명인 경우 ZERO_UUID 폴백 → 0건 매칭 (fail-closed).
    if (user.role === "dealer") {
      query = query.eq("dealer_id", user.id);
    } else if (user.role === "director" || user.role === "team_leader") {
      const ZERO_UUID = "00000000-0000-0000-0000-000000000000";
      type SubResult = { get_subordinate_ids: string } | string;
      const { data: subData, error: subError } = await serviceClient.rpc(
        "get_subordinate_ids" as never,
        { p_user_id: user.id } as never,
      );
      let subordinateIds: string[] = [];
      if (!subError && subData) {
        const rows = subData as unknown as SubResult[];
        subordinateIds = rows.map((r) =>
          typeof r === "string"
            ? r
            : (r as { get_subordinate_ids: string }).get_subordinate_ids,
        );
      }
      const ids = subordinateIds.length > 0 ? subordinateIds : [ZERO_UUID];
      query = query.in("dealer_id", ids);
    }

    // 취소 여부 필터
    if (isCancelledParam === "true") {
      query = query.not("cancelled_at", "is", null);
    } else if (isCancelledParam === "false") {
      query = query.is("cancelled_at", null);
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

    const { data: sales, error: salesError, count } = await query;
    if (salesError) {
      return NextResponse.json(
        { error: "판매 목록을 불러오지 못했습니다." },
        { status: 500 },
      );
    }

    const total = count ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const hasMore = cursor ? (sales?.length ?? 0) > pageSize : false;
    const items = cursor && hasMore ? sales!.slice(0, pageSize) : (sales ?? []);

    if (items.length === 0) {
      return NextResponse.json(
        {
          data: [],
          total,
          page,
          pageSize,
          totalPages,
          nextCursor: null,
        },
        { headers: { "Cache-Control": "private, max-age=10, stale-while-revalidate=60" } },
      );
    }

    // vehicle, dealer, consultation 정보 병렬 조회 후 merge
    const vehicleIds = [...new Set(items.map((s) => s.vehicle_id))];
    const dealerIds = [...new Set(items.map((s) => s.dealer_id))];
    const consultationIds = [
      ...new Set(items.map((s) => s.consultation_id).filter(Boolean) as string[]),
    ];

    const [vehiclesResult, dealersResult, consultationsResult] =
      await Promise.all([
        serviceClient
          .from("vehicles")
          .select("id, vehicle_code, make, model")
          .in("id", vehicleIds),
        serviceClient
          .from("profiles")
          .select("id, name")
          .in("id", dealerIds),
        consultationIds.length > 0
          ? serviceClient
              .from("consultations")
              .select("id, customer_name")
              .in("id", consultationIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

    // 룩업 맵 생성
    const vehicleMap = new Map(
      (vehiclesResult.data ?? []).map((v) => [v.id, v]),
    );
    const dealerMap = new Map(
      (dealersResult.data ?? []).map((d) => [d.id, d]),
    );
    const consultationMap = new Map(
      (consultationsResult.data ?? []).map((c) => [c.id, c]),
    );

    // merge
    const merged = items.map((sale) => {
      const vehicle = vehicleMap.get(sale.vehicle_id);
      const dealer = dealerMap.get(sale.dealer_id);
      const consultation = sale.consultation_id
        ? consultationMap.get(sale.consultation_id)
        : null;

      return {
        ...sale,
        vehicle_code: vehicle?.vehicle_code ?? null,
        vehicle_make: vehicle?.make ?? null,
        vehicle_model: vehicle?.model ?? null,
        dealer_name: dealer?.name ?? null,
        customer_name: consultation?.customer_name ?? null,
      };
    });

    const lastItem = items[items.length - 1];
    const nextCursor =
      cursor && hasMore && lastItem
        ? `${lastItem.created_at}__${lastItem.id}`
        : null;

    return NextResponse.json(
      {
        data: merged,
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

// ─── POST /api/sales — 판매 등록 ─────────────────────────────

/**
 * 판매 등록.
 *
 * - 인증 필수
 * - dealer: dealer_id는 반드시 본인 ID (타인 명의 차단)
 * - admin/staff: dealer_id 자유 선택
 * - is_db_provided=true이면 consultation_id 필수
 * - consultation이 있으면 assigned_dealer_id와 dealer_id 일치 확인
 * - complete_sale RPC 호출 (service_role)
 */
export async function POST(request: NextRequest) {
  try {
    const token = extractToken(request);
    const user = await verifyUser(token);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "요청 데이터 형식이 올바르지 않습니다." },
        { status: 400 },
      );
    }

    const parsed = CreateSaleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            parsed.error.errors[0]?.message ?? "입력 데이터가 올바르지 않습니다.",
        },
        { status: 400 },
      );
    }

    const { consultation_id, vehicle_id, dealer_id, quote_id, is_db_provided } =
      parsed.data;

    // dealer: dealer_id는 반드시 본인
    if (user.role === "dealer" && dealer_id !== user.id) {
      return NextResponse.json(
        { error: "딜러는 본인 명의로만 판매 등록이 가능합니다." },
        { status: 400 },
      );
    }

    // is_db_provided=true인데 consultation_id가 없으면 400
    if (is_db_provided && !consultation_id) {
      return NextResponse.json(
        { error: "DB 제공 판매는 상담 ID가 필요합니다." },
        { status: 400 },
      );
    }

    const serviceClient = createServiceClient();

    // P0-1: 견적서 만료 검증
    if (quote_id) {
      const { data: quote, error: quoteError } = await serviceClient
        .from("quotes")
        .select("id, expires_at")
        .eq("id", quote_id)
        .single();

      if (quoteError || !quote) {
        return NextResponse.json(
          { error: "견적서를 찾을 수 없습니다." },
          { status: 404 },
        );
      }

      if (quote.expires_at !== null && new Date(quote.expires_at) < new Date()) {
        return NextResponse.json(
          { error: "견적서가 만료되었습니다. 새 견적서를 발행해 주세요." },
          { status: 400 },
        );
      }
    }

    // P0-3: 동일 차량에 대한 활성 판매 중복 등록 차단
    // complete_sale RPC가 vehicle.status='sold' 행 잠금으로 보호하지만,
    // 사용자 친화적 메시지 제공을 위해 핸들러에서 선행 조회
    const { data: existingSale, error: existingSaleError } = await serviceClient
      .from("sales")
      .select("id")
      .eq("vehicle_id", vehicle_id)
      .is("cancelled_at", null)
      .limit(1)
      .maybeSingle();

    if (!existingSaleError && existingSale) {
      return NextResponse.json(
        { error: "해당 차량은 이미 판매 등록된 차량입니다." },
        { status: 409 },
      );
    }

    // consultation_id가 있을 때 검증
    if (consultation_id) {
      const { data: consultation, error: consultError } = await serviceClient
        .from("consultations")
        .select("id, status, assigned_dealer_id")
        .eq("id", consultation_id)
        .single();

      if (consultError || !consultation) {
        return NextResponse.json(
          { error: "상담을 찾을 수 없습니다." },
          { status: 404 },
        );
      }

      // 이미 판매 완료된 상담 차단
      if (consultation.status === "sold") {
        return NextResponse.json(
          { error: "이미 판매 완료된 상담입니다." },
          { status: 400 },
        );
      }

      // assigned_dealer_id와 dealer_id 일치 확인
      if (consultation.assigned_dealer_id !== dealer_id) {
        return NextResponse.json(
          { error: "해당 상담이 이 딜러에게 배정되지 않았습니다." },
          { status: 400 },
        );
      }
    }

    // complete_sale RPC 호출
    const { data: saleId, error: rpcError } = await serviceClient.rpc(
      "complete_sale",
      {
        p_consultation_id: consultation_id ?? null,
        p_vehicle_id: vehicle_id,
        p_dealer_id: dealer_id,
        p_actor_id: user.id,
        p_is_db_provided: is_db_provided,
      },
    );

    if (rpcError) {
      console.error("[sales] complete_sale RPC 실패:", rpcError.message);
      return NextResponse.json(
        { error: "판매 등록 처리 중 오류가 발생했습니다." },
        { status: 400 },
      );
    }

    // 커스텀 수당/수수료가 지정된 경우 RPC 자동 계산값 덮어쓰기
    const { dealer_fee: customDealerFee, marketing_fee: customMarketingFee } = parsed.data;
    if (customDealerFee !== undefined || customMarketingFee !== undefined) {
      const updateData: Record<string, number> = {};
      if (customDealerFee !== undefined) updateData.dealer_fee = customDealerFee;
      if (customMarketingFee !== undefined) updateData.marketing_fee = customMarketingFee;
      await serviceClient.from("sales").update(updateData).eq("id", saleId);
    }

    return NextResponse.json(
      { data: { sale_id: saleId } },
      { status: 201 },
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
