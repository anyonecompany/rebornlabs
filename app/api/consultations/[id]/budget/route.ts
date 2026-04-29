import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createServiceClient } from "@/lib/supabase/server";
import { verifyUser, requireRole, AuthError, getAuthErrorMessage} from "@/lib/auth/verify";

// ─── Zod 스키마 ───────────────────────────────────────────────
// 만원 단위 정수. null 허용 = 값 제거.

const BudgetSchema = z.object({
  available_deposit: z
    .number()
    .int("정수만 입력 가능합니다.")
    .nonnegative("0 이상이어야 합니다.")
    .max(999_999, "값이 너무 큽니다.")
    .nullable(),
  desired_monthly_payment: z
    .number()
    .int("정수만 입력 가능합니다.")
    .nonnegative("0 이상이어야 합니다.")
    .max(999_999, "값이 너무 큽니다.")
    .nullable(),
});

// ─── 헬퍼 ────────────────────────────────────────────────────

function extractToken(request: NextRequest): string {
  const authHeader = request.headers.get("Authorization") ?? "";
  return authHeader.replace(/^Bearer\s+/i, "");
}

type RouteContext = { params: Promise<{ id: string }> };

// ─── PATCH /api/consultations/[id]/budget — 예산 정보 편집 ───

/**
 * 상담의 보증금 가능 금액 / 희망 월 납입료를 사후 편집한다 (admin/staff 전용).
 *
 * 배경:
 *   상담 유입은 /apply 랜딩 및 GAS 웹훅을 통해 수신된다. 어드민은 상담을
 *   직접 생성하지 않고 배정·상태·로그만 관리하므로, 예산 값도 고객 통화
 *   후 보정하는 용도로만 수정 가능하게 한다.
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
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

    const parsed = BudgetSchema.safeParse(body);
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

    const { available_deposit, desired_monthly_payment } = parsed.data;
    const serviceClient = createServiceClient();

    // 상담 존재 확인 + 이전 값 감사용 로그
    const { data: consultation, error: consultError } = await serviceClient
      .from("consultations")
      .select("id, available_deposit, desired_monthly_payment")
      .eq("id", id)
      .single();

    if (consultError || !consultation) {
      return NextResponse.json(
        { error: "상담을 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    const { error: updateError } = await serviceClient
      .from("consultations")
      .update({
        available_deposit,
        desired_monthly_payment,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (updateError) {
      return NextResponse.json(
        { error: "예산 정보 저장에 실패했습니다." },
        { status: 500 },
      );
    }

    // 감사 로그 — 변경 전/후 값 모두 기록
    await serviceClient.from("audit_logs").insert({
      actor_id: user.id,
      action: "consultation_budget_updated",
      target_type: "consultation",
      target_id: id,
      metadata: {
        before: {
          available_deposit: consultation.available_deposit,
          desired_monthly_payment: consultation.desired_monthly_payment,
        },
        after: {
          available_deposit,
          desired_monthly_payment,
        },
      },
    });

    return NextResponse.json({
      message: "예산 정보가 저장되었습니다.",
      data: {
        available_deposit,
        desired_monthly_payment,
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
