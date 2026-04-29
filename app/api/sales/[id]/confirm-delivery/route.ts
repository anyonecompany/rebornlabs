import { NextRequest, NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/server";
import { verifyUser, AuthError, getAuthErrorMessage} from "@/lib/auth/verify";
import {
  calculateCommissions,
  type CommissionRecipientRole,
} from "@/src/lib/commission-calculator";

// ─── 헬퍼 ────────────────────────────────────────────────────

function extractToken(request: NextRequest): string {
  const authHeader = request.headers.get("Authorization") ?? "";
  return authHeader.replace(/^Bearer\s+/i, "");
}

type RouteContext = { params: Promise<{ id: string }> };

async function fetchLeaderId(
  serviceClient: ReturnType<typeof createServiceClient>,
  userId: string,
  leaderType: "team_leader" | "director",
): Promise<string | null> {
  const { data } = await serviceClient
    .from("team_assignments")
    .select("leader_id")
    .eq("user_id", userId)
    .eq("leader_type", leaderType)
    .maybeSingle();
  return data?.leader_id ?? null;
}

// ─── POST /api/sales/[id]/confirm-delivery — 출고 확인 + 수당 자동 배분 ──

/**
 * 출고 확인 + 수당 자동 배분.
 *
 * 권한: 인증된 모든 역할 (admin/staff/director/team_leader/dealer).
 *       pending/none은 verifyUser에서 이미 차단.
 *
 * 흐름:
 *   1. sales 조건부 UPDATE (delivery_confirmed_at IS NULL → now) — race condition 방어
 *   2. dealer profile 조회 (role)
 *   3. team_assignments 조회로 상위자(team_leader_id, director_id) 산출
 *   4. calculateCommissions 로 6케이스별 수당 레코드 생성
 *   5. commissions INSERT (UNIQUE 제약 위반 시 롤백)
 *   6. audit_logs INSERT
 *
 * 실패 시 sales.delivery_confirmed_* 를 되돌려 재시도 가능하게 한다.
 */
export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    const { id: saleId } = await context.params;
    const token = extractToken(_request);
    const user = await verifyUser(token);

    const serviceClient = createServiceClient();
    const confirmedAt = new Date().toISOString();

    // 1. 조건부 UPDATE — 아직 미확인 상태일 때만 성공
    const { data: sale, error: updateErr } = await serviceClient
      .from("sales")
      .update({
        delivery_confirmed_at: confirmedAt,
        delivery_confirmed_by: user.id,
      })
      .eq("id", saleId)
      .is("delivery_confirmed_at", null)
      .select("id, dealer_id, is_db_provided, cancelled_at")
      .maybeSingle();

    if (updateErr) {
      return NextResponse.json(
        { error: "출고 확인 처리에 실패했습니다." },
        { status: 500 },
      );
    }

    if (!sale) {
      // 이미 확인됐거나, 존재하지 않음
      const { data: existing } = await serviceClient
        .from("sales")
        .select("id, delivery_confirmed_at")
        .eq("id", saleId)
        .maybeSingle();

      if (!existing) {
        return NextResponse.json(
          { error: "판매 정보를 찾을 수 없습니다." },
          { status: 404 },
        );
      }
      return NextResponse.json(
        { error: "이미 출고 확인된 판매입니다." },
        { status: 409 },
      );
    }

    if (sale.cancelled_at) {
      // 취소된 판매: 되돌리고 거부
      await serviceClient
        .from("sales")
        .update({ delivery_confirmed_at: null, delivery_confirmed_by: null })
        .eq("id", saleId);
      return NextResponse.json(
        { error: "취소된 판매는 출고 확인할 수 없습니다." },
        { status: 409 },
      );
    }

    try {
      // 2. dealer profile 조회
      const { data: dealer, error: dealerErr } = await serviceClient
        .from("profiles")
        .select("id, role")
        .eq("id", sale.dealer_id)
        .single();

      if (dealerErr || !dealer) {
        throw new Error("판매 담당자 정보를 찾을 수 없습니다.");
      }

      const dealerRole = dealer.role as string;
      if (
        dealerRole !== "dealer" &&
        dealerRole !== "team_leader" &&
        dealerRole !== "director"
      ) {
        throw new Error(
          `판매 담당자 역할(${dealerRole})은 수당 배분 대상이 아닙니다.`,
        );
      }

      // 3. 상위자 조회
      let teamLeaderId: string | null = null;
      let directorId: string | null = null;

      if (dealerRole === "dealer") {
        teamLeaderId = await fetchLeaderId(
          serviceClient,
          sale.dealer_id,
          "team_leader",
        );
        if (teamLeaderId) {
          directorId = await fetchLeaderId(
            serviceClient,
            teamLeaderId,
            "director",
          );
        }
      } else if (dealerRole === "team_leader") {
        directorId = await fetchLeaderId(
          serviceClient,
          sale.dealer_id,
          "director",
        );
      }

      // 4. 수당 계산
      const records = calculateCommissions({
        sale_id: saleId,
        is_db_provided: sale.is_db_provided,
        dealer_id: sale.dealer_id,
        dealer_role: dealerRole as CommissionRecipientRole,
        team_leader_id: teamLeaderId,
        director_id: directorId,
      });

      // 5. commissions INSERT
      const { error: insertErr } = await serviceClient
        .from("commissions")
        .insert(records);

      if (insertErr) {
        throw new Error(`수당 생성 실패: ${insertErr.message}`);
      }

      // 6. audit_logs INSERT (실패해도 본 트랜잭션은 성공으로 간주)
      const caseType = records[0]?.case_type ?? null;
      await serviceClient.from("audit_logs").insert({
        actor_id: user.id,
        action: "sale.delivery_confirmed",
        target_type: "sale",
        target_id: saleId,
        metadata: {
          case_type: caseType,
          commissions: records.map((r) => ({
            recipient_id: r.recipient_id,
            recipient_role: r.recipient_role,
            amount: r.amount,
            commission_type: r.commission_type,
          })),
          total_amount: records.reduce((sum, r) => sum + r.amount, 0),
        },
      });

      return NextResponse.json({
        message: "출고 확인 완료. 수당이 배분되었습니다.",
        data: {
          delivery_confirmed_at: confirmedAt,
          delivery_confirmed_by: user.id,
          case_type: caseType,
          commissions: records,
        },
      });
    } catch (innerErr) {
      // 실패 시 sales 업데이트를 되돌림
      await serviceClient
        .from("sales")
        .update({ delivery_confirmed_at: null, delivery_confirmed_by: null })
        .eq("id", saleId);

      const message =
        innerErr instanceof Error
          ? innerErr.message
          : "수당 배분 처리 중 오류가 발생했습니다.";
      return NextResponse.json({ error: message }, { status: 500 });
    }
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
