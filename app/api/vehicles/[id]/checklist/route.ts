import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createServiceClient } from "@/lib/supabase/server";
import { verifyUser, requireRole, AuthError, getAuthErrorMessage } from "@/lib/auth/verify";

// ─── Zod 스키마 ───────────────────────────────────────────────

// 체크리스트 토글 가능 필드
const ChecklistToggleSchema = z
  .object({
    contract_uploaded: z.boolean().optional(),
    deposit_confirmed: z.boolean().optional(),
    customer_briefed: z.boolean().optional(),
    delivery_photo_uploaded: z.boolean().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "수정할 항목이 없습니다.",
  });

// ─── 헬퍼 ────────────────────────────────────────────────────

function extractToken(request: NextRequest): string {
  const authHeader = request.headers.get("Authorization") ?? "";
  return authHeader.replace(/^Bearer\s+/i, "");
}

type RouteContext = { params: Promise<{ id: string }> };

// ─── GET /api/vehicles/[id]/checklist — 체크리스트 조회 ───────

/**
 * 출고 체크리스트 조회.
 * - admin/staff: service_role로 해당 차량의 모든 체크리스트 반환
 * - dealer: RLS가 본인 것만 반환 (dealer_id = auth.uid())
 *
 * NOTE: 딜러 조회는 SSR client가 필요하지만, 이 프로젝트는
 *       Authorization Bearer 토큰 방식을 사용하므로 service_role로
 *       verifyUser()로 검증된 dealer_id 기준 명시적 필터를 적용한다.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id: vehicleId } = await context.params;
    const token = extractToken(request);
    const user = await verifyUser(token);

    const serviceClient = createServiceClient();

    let query = serviceClient
      .from("delivery_checklists")
      .select("*")
      .eq("vehicle_id", vehicleId);

    // 딜러: 본인 것만 조회
    if (user.role === "dealer") {
      query = query.eq("dealer_id", user.id);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      return NextResponse.json(
        { error: "체크리스트 조회에 실패했습니다." },
        { status: 500 },
      );
    }

    return NextResponse.json({ data: data ?? null });
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

// ─── POST /api/vehicles/[id]/checklist — 체크리스트 생성 ──────

/**
 * 출고 체크리스트 생성 (UPSERT).
 * 차량이 sold 상태인 경우에만 생성 가능.
 * (vehicle_id, dealer_id) UNIQUE 제약으로 중복 방지.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id: vehicleId } = await context.params;
    const token = extractToken(request);
    const user = await verifyUser(token);
    // dealer 또는 admin/staff 모두 가능
    requireRole(user, ["admin", "staff", "dealer"]);

    const serviceClient = createServiceClient();

    // 차량 상태 확인: sold여야 함
    const { data: vehicle, error: vehicleError } = await serviceClient
      .from("vehicles")
      .select("id, status")
      .eq("id", vehicleId)
      .is("deleted_at", null)
      .single();

    if (vehicleError || !vehicle) {
      return NextResponse.json(
        { error: "차량을 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    if (vehicle.status !== "sold") {
      return NextResponse.json(
        { error: "판매 완료된 차량에만 출고 체크리스트를 생성할 수 있습니다." },
        { status: 400 },
      );
    }

    // dealer인 경우 본인 id, admin/staff는 body에서 dealer_id 받거나 본인 id 사용
    const dealerId = user.id;

    const { data: checklist, error: upsertError } = await serviceClient
      .from("delivery_checklists")
      .upsert(
        {
          vehicle_id: vehicleId,
          dealer_id: dealerId,
          contract_uploaded: false,
          deposit_confirmed: false,
          customer_briefed: false,
          delivery_photo_uploaded: false,
          completed_at: null,
        },
        { onConflict: "vehicle_id,dealer_id", ignoreDuplicates: false },
      )
      .select()
      .single();

    if (upsertError) {
      return NextResponse.json(
        { error: "체크리스트 생성에 실패했습니다." },
        { status: 500 },
      );
    }

    return NextResponse.json({ data: checklist }, { status: 201 });
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

// ─── PATCH /api/vehicles/[id]/checklist — 항목 토글 ──────────

/**
 * 출고 체크리스트 항목 토글.
 * 본인 체크리스트만 수정 가능 (RLS 대신 명시적 필터 적용).
 * completed_at은 모든 항목이 true일 때 자동 업데이트.
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id: vehicleId } = await context.params;
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

    const parsed = ChecklistToggleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            parsed.error.errors[0]?.message ??
            "입력 데이터가 올바르지 않습니다.",
        },
        { status: 400 },
      );
    }

    const serviceClient = createServiceClient();

    // 기존 체크리스트 조회 (본인 것만)
    const { data: existing, error: fetchError } = await serviceClient
      .from("delivery_checklists")
      .select("*")
      .eq("vehicle_id", vehicleId)
      .eq("dealer_id", user.id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: "체크리스트를 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    // 업데이트할 데이터 계산
    const updatedFields = { ...parsed.data };

    // 모든 항목 완료 여부 확인 → completed_at 자동 설정
    const mergedState = {
      contract_uploaded:
        updatedFields.contract_uploaded ?? existing.contract_uploaded,
      deposit_confirmed:
        updatedFields.deposit_confirmed ?? existing.deposit_confirmed,
      customer_briefed:
        updatedFields.customer_briefed ?? existing.customer_briefed,
      delivery_photo_uploaded:
        updatedFields.delivery_photo_uploaded ??
        existing.delivery_photo_uploaded,
    };

    const allCompleted = Object.values(mergedState).every(Boolean);
    const completedAt = allCompleted
      ? existing.completed_at ?? new Date().toISOString()
      : null;

    const { data: updated, error: updateError } = await serviceClient
      .from("delivery_checklists")
      .update({
        ...updatedFields,
        completed_at: completedAt,
        updated_at: new Date().toISOString(),
      })
      .eq("vehicle_id", vehicleId)
      .eq("dealer_id", user.id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json(
        { error: "체크리스트 업데이트에 실패했습니다." },
        { status: 500 },
      );
    }

    return NextResponse.json({ data: updated });
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
