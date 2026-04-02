import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createServiceClient } from "@/lib/supabase/server";
import { verifyUser, requireRole, AuthError } from "@/lib/auth/verify";

// ─── Zod 스키마 ───────────────────────────────────────────────

const CreateVehicleSchema = z.object({
  make: z.string().min(1, "제조사는 필수입니다."),
  model: z.string().min(1, "모델명은 필수입니다."),
  year: z
    .number()
    .int()
    .min(1900, "연식은 1900년 이후여야 합니다.")
    .max(2100, "연식은 2100년 이하여야 합니다."),
  mileage: z.number().int().min(0, "주행거리는 0 이상이어야 합니다.").optional(),
  purchase_price: z
    .number()
    .int()
    .min(0, "매입가는 0 이상이어야 합니다."),
  selling_price: z.number().int().min(0, "판매가는 0 이상이어야 합니다."),
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
  photos: z.array(z.string().url()).optional().default([]),
  plate_number: z.string().nullable().optional(),
  vin: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
});

// ─── 헬퍼: Authorization 헤더에서 토큰 추출 ───────────────────

function extractToken(request: NextRequest): string {
  const authHeader = request.headers.get("Authorization") ?? "";
  return authHeader.replace(/^Bearer\s+/i, "");
}

// ─── GET /api/vehicles — 차량 목록 조회 ──────────────────────

/**
 * 차량 목록 조회 (커서 기반 페이지네이션).
 *
 * - admin/staff: vehicles 직접 조회 (purchase_price, margin 포함)
 * - dealer: vehicles_dealer_view 사용 (민감 정보 제외)
 * - 페이지 크기: 20건
 * - 커서: "created_at__id" 형식
 */
export async function GET(request: NextRequest) {
  try {
    const token = extractToken(request);
    const user = await verifyUser(token);

    const { searchParams } = new URL(request.url);
    const cursor = searchParams.get("cursor"); // "created_at__id" 형식
    const search = searchParams.get("search") ?? "";
    const status = searchParams.get("status") ?? "";
    const PAGE_SIZE = 20;

    const serviceClient = createServiceClient();
    const isDealer = user.role === "dealer";

    // 딜러: vehicles에서 직접 조회 (purchase_price, margin 제외)
    // vehicles_dealer_view는 user_role() 의존으로 service_role에서 빈 결과 반환
    if (isDealer) {
      let query = serviceClient
        .from("vehicles")
        .select("id, vehicle_code, make, model, year, mileage, selling_price, deposit, monthly_payment, status, photos, created_at, updated_at")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(PAGE_SIZE + 1);

      if (search) {
        query = query.or(
          `make.ilike.%${search}%,model.ilike.%${search}%,vehicle_code.ilike.%${search}%`,
        );
      }
      if (status) {
        query = query.eq("status", status as "available" | "consulting" | "sold" | "deleted" | "vehicle_waiting");
      }
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
          { error: "차량 목록을 불러오지 못했습니다." },
          { status: 500 },
        );
      }

      const hasMore = (data?.length ?? 0) > PAGE_SIZE;
      const items = hasMore ? data!.slice(0, PAGE_SIZE) : (data ?? []);
      const lastItem = items[items.length - 1];
      const nextCursor =
        hasMore && lastItem ? `${lastItem.created_at}__${lastItem.id}` : null;

      return NextResponse.json({ data: items, nextCursor });
    }

    // admin/staff
    let query = serviceClient
      .from("vehicles")
      .select("*")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(PAGE_SIZE + 1);

    if (search) {
      query = query.or(
        `make.ilike.%${search}%,model.ilike.%${search}%,vehicle_code.ilike.%${search}%`,
      );
    }
    if (status) {
      query = query.eq("status", status as "available" | "consulting" | "sold" | "deleted" | "vehicle_waiting");
    }
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
        { error: "차량 목록을 불러오지 못했습니다." },
        { status: 500 },
      );
    }

    const hasMore = (data?.length ?? 0) > PAGE_SIZE;
    const items = hasMore ? data!.slice(0, PAGE_SIZE) : (data ?? []);
    const lastItem = items[items.length - 1];
    const nextCursor =
      hasMore && lastItem ? `${lastItem.created_at}__${lastItem.id}` : null;

    return NextResponse.json({ data: items, nextCursor });
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

// ─── POST /api/vehicles — 차량 등록 ──────────────────────────

/**
 * 차량 등록 (admin/staff 전용).
 * vehicle_code는 DB 트리거(trg_generate_vehicle_code)가 자동 생성한다.
 */
export async function POST(request: NextRequest) {
  try {
    const token = extractToken(request);
    const user = await verifyUser(token);
    requireRole(user, ["admin", "staff"]);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "요청 데이터 형식이 올바르지 않습니다." },
        { status: 400 },
      );
    }

    const parsed = CreateVehicleSchema.safeParse(body);
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

    // 타입: Insert에 status, deleted_at optional이므로 명시 포함
    const insertData = {
      make: parsed.data.make,
      model: parsed.data.model,
      year: parsed.data.year,
      mileage: parsed.data.mileage ?? 0,
      purchase_price: parsed.data.purchase_price,
      selling_price: parsed.data.selling_price,
      deposit: parsed.data.deposit ?? 0,
      monthly_payment: parsed.data.monthly_payment ?? 0,
      photos: parsed.data.photos,
      plate_number: parsed.data.plate_number ?? null,
      vin: parsed.data.vin ?? null,
      color: parsed.data.color ?? null,
      status: "available" as const,
      deleted_at: null,
    };

    const serviceClient = createServiceClient();
    const { data: vehicle, error } = await serviceClient
      .from("vehicles")
      .insert(insertData)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: "차량 등록에 실패했습니다." },
        { status: 500 },
      );
    }

    return NextResponse.json({ data: vehicle }, { status: 201 });
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
