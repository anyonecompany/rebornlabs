import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createServiceClient } from "@/lib/supabase/server";
import { verifyUser, requireRole, AuthError, getAuthErrorMessage} from "@/lib/auth/verify";

// ─── Zod 스키마 ───────────────────────────────────────────────

const UpdateVehicleSchema = z
  .object({
    make: z.string().min(1, "제조사는 비워둘 수 없습니다.").optional(),
    model: z.string().min(1, "모델명은 비워둘 수 없습니다.").optional(),
    year: z
      .number()
      .int()
      .min(1900, "연식은 1900년 이후여야 합니다.")
      .max(2100, "연식은 2100년 이하여야 합니다.")
      .optional(),
    mileage: z
      .number()
      .int()
      .min(0, "주행거리는 0 이상이어야 합니다.")
      .optional(),
    purchase_price: z
      .number()
      .int()
      .min(0, "매입가는 0 이상이어야 합니다.")
      .optional(),
    selling_price: z
      .number()
      .int()
      .min(0, "판매가는 0 이상이어야 합니다.")
      .optional(),
    deposit: z
      .number()
      .int()
      .min(0, "보증금은 0 이상이어야 합니다.")
      .optional(),
    monthly_payment: z
      .number()
      .int()
      .min(0, "월납입료는 0 이상이어야 합니다.")
      .optional(),
    photos: z.array(z.string().url()).optional(),
    status: z
      .enum(["available", "consulting", "vehicle_waiting", "sold"])
      .optional(),
    plate_number: z.string().nullable().optional(),
    vin: z.string().nullable().optional(),
    color: z.string().nullable().optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    // 둘 다 포함된 경우에만 cross-field 검증 (부분 업데이트 지원)
    if (data.selling_price !== undefined && data.purchase_price !== undefined) {
      if (data.selling_price < data.purchase_price) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "판매가는 매입가 이상이어야 합니다.",
          path: ["selling_price"],
        });
      }
    }
  });

// ─── 헬퍼 ────────────────────────────────────────────────────

function extractToken(request: NextRequest): string {
  const authHeader = request.headers.get("Authorization") ?? "";
  return authHeader.replace(/^Bearer\s+/i, "");
}

type RouteContext = { params: Promise<{ id: string }> };

// ─── GET /api/vehicles/[id] — 차량 상세 ──────────────────────

/**
 * 차량 상세 조회.
 * - admin/staff: vehicles 직접 (purchase_price, margin 포함)
 * - dealer: vehicles_dealer_view (민감 정보 제외)
 * - 출고 체크리스트도 함께 반환
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const token = extractToken(request);
    const user = await verifyUser(token);

    const serviceClient = createServiceClient();
    const isDealer = user.role === "dealer";

    let vehicle: Record<string, unknown> | null = null;

    if (isDealer) {
      const { data, error } = await serviceClient
        .from("vehicles")
        .select("id, vehicle_code, make, model, year, mileage, selling_price, deposit, monthly_payment, status, photos, plate_number, vin, color, created_at, updated_at")
        .eq("id", id)
        .is("deleted_at", null)
        .single();
      if (error || !data) {
        return NextResponse.json(
          { error: "차량을 찾을 수 없습니다." },
          { status: 404 },
        );
      }
      vehicle = data as Record<string, unknown>;
    } else {
      const { data, error } = await serviceClient
        .from("vehicles")
        .select("*")
        .eq("id", id)
        .is("deleted_at", null)
        .single();
      if (error || !data) {
        return NextResponse.json(
          { error: "차량을 찾을 수 없습니다." },
          { status: 404 },
        );
      }
      vehicle = data as Record<string, unknown>;
    }

    // 출고 체크리스트 조회
    const { data: checklists } = await serviceClient
      .from("delivery_checklists")
      .select("*")
      .eq("vehicle_id", id);

    // photos → public URL 통일 (signed URL, path 모두 대응)
    if (vehicle && Array.isArray(vehicle.photos)) {
      vehicle.photos = (vehicle.photos as string[]).map((photo) => {
        if (typeof photo !== "string" || !photo) return photo;
        if (photo.includes("/object/public/vehicles/")) return photo;
        if (photo.startsWith("http")) {
          const match = photo.match(/\/vehicles\/(.+?)(?:\?|$)/);
          if (match?.[1]) {
            const { data } = serviceClient.storage.from("vehicles").getPublicUrl(decodeURIComponent(match[1]));
            return data.publicUrl;
          }
          return photo;
        }
        const { data } = serviceClient.storage.from("vehicles").getPublicUrl(photo);
        return data.publicUrl;
      });
    }

    return NextResponse.json({
      data: vehicle,
      checklists: checklists ?? [],
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

// ─── PATCH /api/vehicles/[id] — 차량 수정 ────────────────────

/**
 * 차량 정보 수정 (admin/staff 전용).
 * 소프트 삭제된 차량은 수정 불가.
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const token = extractToken(request);
    const user = await verifyUser(token);
    requireRole(user, ["admin", "staff"]);

    const serviceClient = createServiceClient();

    // 삭제 여부 확인
    const { data: existing, error: fetchError } = await serviceClient
      .from("vehicles")
      .select("id, deleted_at")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: "차량을 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    if (existing.deleted_at !== null) {
      return NextResponse.json(
        { error: "삭제된 차량은 수정할 수 없습니다." },
        { status: 400 },
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "요청 데이터 형식이 올바르지 않습니다." },
        { status: 400 },
      );
    }

    const parsed = UpdateVehicleSchema.safeParse(body);
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

    if (Object.keys(parsed.data).length === 0) {
      return NextResponse.json(
        { error: "수정할 필드가 없습니다." },
        { status: 400 },
      );
    }

    const { data: updated, error: updateError } = await serviceClient
      .from("vehicles")
      .update({ ...parsed.data, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json(
        { error: "차량 수정에 실패했습니다." },
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

// ─── DELETE /api/vehicles/[id] — 소프트 삭제 ─────────────────

/**
 * 차량 소프트 삭제 (admin/staff 전용).
 *
 * 취소되지 않은 판매 기록이 있으면 삭제 불가 (409).
 * (consultations는 vehicle_id 없음 → sales.vehicle_id로 체크)
 * 삭제 후 audit_logs에 기록 (service_role 사용 — RLS bypass).
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const token = extractToken(request);
    const user = await verifyUser(token);
    requireRole(user, ["admin", "staff"]);

    const serviceClient = createServiceClient();

    // 차량 존재 확인
    const { data: vehicle, error: fetchError } = await serviceClient
      .from("vehicles")
      .select("id, vehicle_code, deleted_at")
      .eq("id", id)
      .single();

    if (fetchError || !vehicle) {
      return NextResponse.json(
        { error: "차량을 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    if (vehicle.deleted_at !== null) {
      return NextResponse.json(
        { error: "이미 삭제된 차량입니다." },
        { status: 400 },
      );
    }

    // 활성 판매 기록 체크: 취소되지 않은 sales가 있으면 차단
    const { data: activeSales, error: salesError } = await serviceClient
      .from("sales")
      .select("id")
      .eq("vehicle_id", id)
      .is("cancelled_at", null)
      .limit(1);

    if (salesError) {
      return NextResponse.json(
        { error: "판매 기록 조회 중 오류가 발생했습니다." },
        { status: 500 },
      );
    }

    if ((activeSales?.length ?? 0) > 0) {
      return NextResponse.json(
        { error: "판매 기록이 있는 차량은 삭제할 수 없습니다." },
        { status: 409 },
      );
    }

    // 소프트 삭제
    const { error: deleteError } = await serviceClient
      .from("vehicles")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);

    if (deleteError) {
      return NextResponse.json(
        { error: "차량 삭제에 실패했습니다." },
        { status: 500 },
      );
    }

    // audit_logs 기록 (service_role — authenticated는 INSERT 불가)
    await serviceClient.from("audit_logs").insert({
      actor_id: user.id,
      action: "vehicle_deleted",
      target_type: "vehicle",
      target_id: id,
      metadata: { vehicle_code: vehicle.vehicle_code },
    });

    return NextResponse.json({ message: "차량이 삭제되었습니다." });
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
