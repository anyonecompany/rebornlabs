import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createServiceClient } from "@/lib/supabase/server";
import { verifyUser, requireRole, AuthError, getAuthErrorMessage } from "@/lib/auth/verify";

// ─── Zod 스키마 ───────────────────────────────────────────────

const AssignSchema = z.object({
  dealer_id: z.string().uuid("유효한 딜러 ID가 아닙니다.").nullable(),
  marketing_company: z.string().nullable().optional(),
});

// ─── 헬퍼 ────────────────────────────────────────────────────

function extractToken(request: NextRequest): string {
  const authHeader = request.headers.get("Authorization") ?? "";
  return authHeader.replace(/^Bearer\s+/i, "");
}

type RouteContext = { params: Promise<{ id: string }> };

// ─── PATCH /api/consultations/[id]/assign — 딜러 배정 ────────

/**
 * 상담에 딜러를 배정한다 (admin/staff 전용).
 *
 * - dealers_name_view에서 딜러 존재 확인
 * - consultations.assigned_dealer_id, marketing_company 업데이트
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const token = extractToken(request);
    const user = await verifyUser(token);
    requireRole(user, ["admin", "staff", "director", "team_leader"]);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "요청 데이터 형식이 올바르지 않습니다." },
        { status: 400 },
      );
    }

    const parsed = AssignSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            parsed.error.errors[0]?.message ?? "입력 데이터가 올바르지 않습니다.",
        },
        { status: 400 },
      );
    }

    const { dealer_id, marketing_company } = parsed.data;
    const serviceClient = createServiceClient();

    // 상담 존재 확인
    const { data: consultation, error: consultError } = await serviceClient
      .from("consultations")
      .select("id")
      .eq("id", id)
      .single();

    if (consultError || !consultation) {
      return NextResponse.json(
        { error: "상담을 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    // 배정 해제 (dealer_id === null)
    if (dealer_id === null) {
      const { error: clearErr } = await serviceClient
        .from("consultations")
        .update({
          assigned_dealer_id: null,
          marketing_company: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (clearErr) {
        return NextResponse.json({ error: "배정 해제에 실패했습니다." }, { status: 500 });
      }

      await serviceClient.from("audit_logs").insert({
        actor_id: user.id,
        action: "dealer_unassigned",
        target_type: "consultation",
        target_id: id,
        metadata: {},
      });

      return NextResponse.json({ message: "배정이 해제되었습니다." });
    }

    // 배정 대상 존재 확인 — dealer/team_leader/director 모두 영업 라인이므로 배정 가능
    const { data: dealer, error: dealerError } = await serviceClient
      .from("profiles")
      .select("id, name, role")
      .eq("id", dealer_id)
      .in("role", ["dealer", "team_leader", "director"])
      .eq("is_active", true)
      .single();

    if (dealerError || !dealer) {
      return NextResponse.json(
        { error: "유효하지 않은 배정 대상입니다." },
        { status: 400 },
      );
    }

    // 딜러 배정 업데이트
    const updateData: Record<string, unknown> = {
      assigned_dealer_id: dealer_id,
      updated_at: new Date().toISOString(),
    };
    if (marketing_company !== undefined) {
      updateData.marketing_company = marketing_company;
    }

    const { error: updateError } = await serviceClient
      .from("consultations")
      .update(updateData)
      .eq("id", id);

    if (updateError) {
      return NextResponse.json(
        { error: "딜러 배정에 실패했습니다." },
        { status: 500 },
      );
    }

    // 감사 로그 기록
    await serviceClient.from("audit_logs").insert({
      actor_id: user.id,
      action: "dealer_assigned",
      target_type: "consultation",
      target_id: id,
      metadata: { dealer_id, dealer_name: dealer.name, marketing_company: marketing_company ?? null },
    });

    return NextResponse.json({ message: "딜러가 배정되었습니다." });
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
