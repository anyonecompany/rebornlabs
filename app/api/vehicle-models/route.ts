import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createServiceClient } from "@/lib/supabase/server";
import { verifyUser, AuthError } from "@/lib/auth/verify";

// ─── 스키마 ───────────────────────────────────────────────────

const CreateSchema = z.object({
  brand: z.string().min(1).max(50),
  model: z.string().min(1).max(100),
  trim: z.string().min(1).max(100),
  carPrice: z.number().int().positive(),
  monthlyPayment: z.number().int().positive().nullable().optional(),
  maxDeposit: z.number().int().min(0),
  displayOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

// ─── 헬퍼 ────────────────────────────────────────────────────

function extractToken(request: NextRequest): string {
  const authHeader = request.headers.get("Authorization") ?? "";
  return authHeader.replace(/^Bearer\s+/i, "");
}

function requireAdminStaff(role: string): boolean {
  return role === "admin" || role === "staff";
}

// ─── GET /api/vehicle-models ─────────────────────────────────
// 어드민 관리 목록. admin/staff만.
// Query: search, status(all/active/inactive), page, pageSize

export async function GET(request: NextRequest) {
  try {
    const token = extractToken(request);
    const user = await verifyUser(token);

    if (!requireAdminStaff(user.role as string)) {
      return NextResponse.json(
        { error: "조회 권한이 없습니다." },
        { status: 403 },
      );
    }

    const { searchParams } = new URL(request.url);
    const search = (searchParams.get("search") ?? "").trim();
    const status = (searchParams.get("status") ?? "all") as
      | "all"
      | "active"
      | "inactive";
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const pageSize = Math.min(
      100,
      Math.max(1, Number(searchParams.get("pageSize") ?? 20)),
    );

    const serviceClient = createServiceClient();
    let query = serviceClient
      .from("vehicle_models")
      .select(
        "id, brand, model, trim, car_price, monthly_payment, max_deposit, display_order, is_active, created_at, updated_at",
        { count: "exact" },
      )
      .order("display_order", { ascending: true })
      .order("brand", { ascending: true });

    if (status === "active") query = query.eq("is_active", true);
    else if (status === "inactive") query = query.eq("is_active", false);

    if (search) {
      query = query.or(
        `brand.ilike.%${search}%,model.ilike.%${search}%,trim.ilike.%${search}%`,
      );
    }

    const offset = (page - 1) * pageSize;
    query = query.range(offset, offset + pageSize - 1);

    const { data, count, error } = await query;

    if (error) {
      return NextResponse.json(
        { error: "차량 모델 목록을 불러오지 못했습니다." },
        { status: 500 },
      );
    }

    const items = (data ?? []).map((row) => ({
      id: row.id,
      brand: row.brand,
      model: row.model,
      trim: row.trim,
      carPrice: row.car_price,
      monthlyPayment: row.monthly_payment,
      maxDeposit: row.max_deposit,
      displayOrder: row.display_order,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    const total = count ?? items.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    return NextResponse.json({ items, total, page, pageSize, totalPages });
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

// ─── POST /api/vehicle-models — 단일 등록 ─────────────────────

export async function POST(request: NextRequest) {
  try {
    const token = extractToken(request);
    const user = await verifyUser(token);

    if (!requireAdminStaff(user.role as string)) {
      return NextResponse.json(
        { error: "등록 권한이 없습니다." },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            parsed.error.issues[0]?.message ?? "요청 형식이 올바르지 않습니다.",
        },
        { status: 400 },
      );
    }

    const input = parsed.data;
    const serviceClient = createServiceClient();

    const { data: inserted, error: insertError } = await serviceClient
      .from("vehicle_models")
      .insert({
        brand: input.brand.trim(),
        model: input.model.trim(),
        trim: input.trim.trim(),
        car_price: input.carPrice,
        monthly_payment: input.monthlyPayment ?? null,
        max_deposit: input.maxDeposit,
        display_order: input.displayOrder ?? 0,
        is_active: input.isActive ?? true,
      })
      .select(
        "id, brand, model, trim, car_price, monthly_payment, max_deposit, display_order, is_active, created_at, updated_at",
      )
      .single();

    if (insertError || !inserted) {
      const code = (insertError as { code?: string } | null)?.code;
      if (code === "23505") {
        return NextResponse.json(
          { error: "이미 등록된 브랜드/모델/등급 조합입니다." },
          { status: 409 },
        );
      }
      return NextResponse.json(
        { error: "차량 모델 등록에 실패했습니다." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      item: {
        id: inserted.id,
        brand: inserted.brand,
        model: inserted.model,
        trim: inserted.trim,
        carPrice: inserted.car_price,
        monthlyPayment: inserted.monthly_payment,
        maxDeposit: inserted.max_deposit,
        displayOrder: inserted.display_order,
        isActive: inserted.is_active,
        createdAt: inserted.created_at,
        updatedAt: inserted.updated_at,
      },
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
