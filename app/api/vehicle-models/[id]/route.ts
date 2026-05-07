import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createServiceClient } from "@/lib/supabase/server";
import { verifyUser, requireCapability, AuthError, getAuthErrorMessage } from "@/lib/auth/verify";

const UpdateSchema = z
  .object({
    brand: z.string().min(1).max(50).optional(),
    model: z.string().min(1).max(100).optional(),
    trim: z.string().min(1).max(100).optional(),
    carPrice: z.number().int().positive().optional(),
    monthlyPayment: z.number().int().positive().nullable().optional(),
    maxDeposit: z.number().int().min(0).optional(),
    displayOrder: z.number().int().min(0).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "수정할 필드가 없습니다.",
  });

function extractToken(request: NextRequest): string {
  const authHeader = request.headers.get("Authorization") ?? "";
  return authHeader.replace(/^Bearer\s+/i, "");
}

type RouteContext = { params: Promise<{ id: string }> };

// ─── PATCH /api/vehicle-models/[id] ───────────────────────────

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const token = extractToken(request);
    const user = await verifyUser(token);
    requireCapability(user, "vehicle-models:write");

    const body = await request.json().catch(() => ({}));
    const parsed = UpdateSchema.safeParse(body);
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
    const updates: Record<string, string | number | boolean | null> = {};
    if (input.brand !== undefined) updates.brand = input.brand.trim();
    if (input.model !== undefined) updates.model = input.model.trim();
    if (input.trim !== undefined) updates.trim = input.trim.trim();
    if (input.carPrice !== undefined) updates.car_price = input.carPrice;
    if (input.monthlyPayment !== undefined)
      updates.monthly_payment = input.monthlyPayment;
    if (input.maxDeposit !== undefined) updates.max_deposit = input.maxDeposit;
    if (input.displayOrder !== undefined)
      updates.display_order = input.displayOrder;
    if (input.isActive !== undefined) updates.is_active = input.isActive;

    const serviceClient = createServiceClient();

    const { data: updated, error: updateError } = await serviceClient
      .from("vehicle_models")
      .update(updates)
      .eq("id", id)
      .select(
        "id, brand, model, trim, car_price, monthly_payment, max_deposit, display_order, is_active, created_at, updated_at",
      )
      .single();

    if (updateError || !updated) {
      const code = (updateError as { code?: string } | null)?.code;
      if (code === "23505") {
        return NextResponse.json(
          { error: "이미 등록된 브랜드/모델/등급 조합입니다." },
          { status: 409 },
        );
      }
      return NextResponse.json(
        { error: "차량 모델 수정에 실패했습니다." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      item: {
        id: updated.id,
        brand: updated.brand,
        model: updated.model,
        trim: updated.trim,
        carPrice: updated.car_price,
        monthlyPayment: updated.monthly_payment,
        maxDeposit: updated.max_deposit,
        displayOrder: updated.display_order,
        isActive: updated.is_active,
        createdAt: updated.created_at,
        updatedAt: updated.updated_at,
      },
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

// ─── DELETE /api/vehicle-models/[id] — 영구 삭제 ─────────────
// soft-delete(비활성화)는 PATCH {isActive:false}로. 이 DELETE는 완전 제거.

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const token = extractToken(request);
    const user = await verifyUser(token);

    if (user.role !== "admin") {
      return NextResponse.json(
        { error: "삭제는 경영진만 가능합니다." },
        { status: 403 },
      );
    }

    const serviceClient = createServiceClient();
    const { error } = await serviceClient
      .from("vehicle_models")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json(
        { error: "삭제에 실패했습니다." },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
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
