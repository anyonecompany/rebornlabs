import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createServiceClient } from "@/lib/supabase/server";
import { verifyUser, requireRole, AuthError, getAuthErrorMessage} from "@/lib/auth/verify";
import type { ConsultationStatus } from "@/types/database";

// ─── 상태 전이 매트릭스 ───────────────────────────────────────

/**
 * admin/staff가 API에서 직접 변경 가능한 전이 매트릭스.
 * DB 트리거(enforce_consultation_transition)가 최종 강제하지만
 * 친절한 에러 메시지를 위해 API에서도 사전 검증한다.
 */
const ALLOWED_TRANSITIONS: Record<ConsultationStatus, ConsultationStatus[]> = {
  new: ["consulting", "rejected"],
  consulting: ["new", "vehicle_waiting", "rejected"],
  vehicle_waiting: ["consulting", "rejected"],
  rejected: ["new", "consulting"],
  sold: [],
};

// ─── Zod 스키마 ───────────────────────────────────────────────

const StatusSchema = z.object({
  status: z.enum(
    ["new", "consulting", "vehicle_waiting", "rejected", "sold"],
    {
      errorMap: () => ({ message: "유효하지 않은 상태값입니다." }),
    },
  ),
});

// ─── 헬퍼 ────────────────────────────────────────────────────

function extractToken(request: NextRequest): string {
  const authHeader = request.headers.get("Authorization") ?? "";
  return authHeader.replace(/^Bearer\s+/i, "");
}

type RouteContext = { params: Promise<{ id: string }> };

// ─── PATCH /api/consultations/[id]/status — 상태 직접 변경 ───

/**
 * 상담 상태 직접 변경.
 *
 * - admin / staff: 모든 상담 상태 변경 가능
 * - director / team_leader: 하위 딜러 배정 상담만 변경 가능
 * - dealer: 본인 배정 상담만 변경 가능
 * sold 상태는 complete_sale() 함수 통해서만 설정 가능.
 * DB 트리거가 최종 강제하며, API는 친절한 에러 메시지를 먼저 제공한다.
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const token = extractToken(request);
    const user = await verifyUser(token);
    requireRole(user, ["admin", "staff", "director", "team_leader", "dealer"]);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "요청 데이터 형식이 올바르지 않습니다." },
        { status: 400 },
      );
    }

    const parsed = StatusSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            parsed.error.errors[0]?.message ?? "입력 데이터가 올바르지 않습니다.",
        },
        { status: 400 },
      );
    }

    const { status: newStatus } = parsed.data;

    // sold는 API에서 직접 설정 불가 (complete_sale() 전용)
    if (newStatus === "sold") {
      return NextResponse.json(
        {
          error:
            "판매 완료 상태는 판매 처리 기능을 통해서만 변경할 수 있습니다.",
        },
        { status: 400 },
      );
    }

    const serviceClient = createServiceClient();

    // 상담 현재 상태 조회
    const { data: consultation, error: consultError } = await serviceClient
      .from("consultations")
      .select("id, status, assigned_dealer_id")
      .eq("id", id)
      .single();

    if (consultError || !consultation) {
      return NextResponse.json(
        { error: "상담을 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    // 역할별 상담 접근 범위 검증
    if (user.role === "dealer") {
      // dealer: 본인 배정 상담만 변경 가능
      if (consultation.assigned_dealer_id !== user.id) {
        return NextResponse.json(
          { error: "본인이 담당하는 상담만 상태를 변경할 수 있습니다." },
          { status: 403 },
        );
      }
    } else if (user.role === "director" || user.role === "team_leader") {
      // director / team_leader: 하위 딜러 배정 상담만 변경 가능
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
      const allowedIds =
        subordinateIds.length > 0 ? subordinateIds : [ZERO_UUID];
      if (
        !consultation.assigned_dealer_id ||
        !allowedIds.includes(consultation.assigned_dealer_id)
      ) {
        return NextResponse.json(
          { error: "산하 딜러가 담당하는 상담만 상태를 변경할 수 있습니다." },
          { status: 403 },
        );
      }
    }

    const currentStatus = consultation.status as ConsultationStatus;

    // sold 상태에서는 어떤 변경도 불가
    if (currentStatus === "sold") {
      return NextResponse.json(
        {
          error:
            "판매 완료된 상담은 상태를 변경할 수 없습니다.",
        },
        { status: 400 },
      );
    }

    // 전이 허용 여부 확인
    const allowedNext = ALLOWED_TRANSITIONS[currentStatus] ?? [];
    if (!allowedNext.includes(newStatus as ConsultationStatus)) {
      return NextResponse.json(
        {
          error: `현재 상태(${currentStatus})에서 ${newStatus}로 변경할 수 없습니다. 허용 상태: ${allowedNext.join(", ")}`,
        },
        { status: 400 },
      );
    }

    // 상태 업데이트
    const { error: updateError } = await serviceClient
      .from("consultations")
      .update({
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (updateError) {
      // DB 트리거가 전이 규칙을 강제하므로, 트리거 에러도 사용자 친화적으로
      console.error("[consultations/status] 상태 변경 실패:", updateError.message);
      return NextResponse.json(
        { error: "상태 변경에 실패했습니다. 허용되지 않는 전이일 수 있습니다." },
        { status: 400 },
      );
    }

    return NextResponse.json({ message: "상태가 변경되었습니다." });
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
