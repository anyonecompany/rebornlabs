import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createServiceClient } from "@/lib/supabase/server";
import { verifyUser, requireRole, AuthError, getAuthErrorMessage } from "@/lib/auth/verify";
import { sendAlimtalk } from "@/lib/alimtalk/send";
import { maskCustomerName } from "@/lib/alimtalk/templates";

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

/**
 * 딜러에게 배정 알림톡 발송. fire-and-forget.
 * dealer.phone 미설정이거나 templateId 미설정이면 silent skip (sandbox 모드 OK).
 */
async function notifyDealerAsync(input: {
  to: string | null;
  customerName: string;
  vehicle: string | null;
  consultationId: string;
  assignmentId: string | null;
}): Promise<void> {
  if (!input.to) return;
  const ackLink = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://rebornlabs-admin.vercel.app"}/consultations/${input.consultationId}`;
  const masked = maskCustomerName(input.customerName);
  const vehicle = input.vehicle ?? "관심 차량 미지정";
  // SMS 폴백 본문 — 90자 이내. 사전심사 통과 전까지 이걸로 발송.
  const fmessage = `[리본랩스] ${masked}님 (${vehicle}) 상담 배정. 30분 내 응대 ${ackLink}`;
  await sendAlimtalk({
    template: "consultation.assigned_to_dealer",
    to: input.to,
    variables: {
      "#{customer_name}": masked,
      "#{vehicle}": vehicle,
      "#{ack_link}": ackLink,
    },
    fmessage,
    auditContext: {
      consultation_id: input.consultationId,
      assignment_id: input.assignmentId,
    },
  });
}

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

    // 상담 존재 확인 — 알림톡 변수에 사용할 customer_name, interested_vehicle 도 함께
    const { data: consultation, error: consultError } = await serviceClient
      .from("consultations")
      .select("id, customer_name, interested_vehicle")
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
      .select("id, name, role, phone")
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

    // consultation_assignments 이력 INSERT (best-effort) — 마이그레이션 009 적용된 환경에서만 동작.
    // 트리거가 자동으로 active pending cancelled + assigned_dealer_id 동기화 처리.
    //
    // 관리자 수동 배정은 즉시 'acknowledged' 로 INSERT — 책임이 이미 확정된 상태이므로
    // 30분 무응답 만료(consultation-timeout cron)의 대상이 아니다. (#30 cron 은 향후
    // 자동/외부 배정 흐름이 도입될 때 'pending' 상태로 INSERT 하는 경로에서 사용)
    let assignmentId: string | null = null;
    try {
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      const acknowledgedAt = new Date().toISOString();
      const { data: ass, error: assErr } = await serviceClient
        .from("consultation_assignments")
        .insert({
          consultation_id: id,
          dealer_id,
          assigned_by: user.id,
          expires_at: expiresAt,
          status: "acknowledged",
          acknowledged_at: acknowledgedAt,
        })
        .select("id")
        .single();
      if (!assErr && ass) {
        assignmentId = (ass as { id: string }).id;
      }
    } catch {
      // 마이그레이션 미적용 또는 RLS 거부 — 알림톡은 그대로 진행
    }

    // 딜러 알림톡 (fire-and-forget)
    void notifyDealerAsync({
      to: dealer.phone,
      customerName: consultation.customer_name,
      vehicle: consultation.interested_vehicle,
      consultationId: id,
      assignmentId,
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
