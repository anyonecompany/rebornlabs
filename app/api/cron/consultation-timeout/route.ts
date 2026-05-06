import { NextRequest, NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/server";
import { sendAlimtalk } from "@/lib/alimtalk/send";
import { maskCustomerName } from "@/lib/alimtalk/templates";

/**
 * 30분 무응답 배정 자동 만료 Cron — **현재 비활성**.
 *
 * 비활성 사유 (2026-05-06):
 *   응대 흐름(dealer 화면 "응대 시작" 버튼 + acknowledge API + 알림톡)이
 *   미완성 상태로 cron 만 가동되어 모든 수동 배정이 30분 후 풀리는 사고 발생.
 *   응대 흐름이 도입(카카오 알림톡 정식 연동) 되는 시점에 함께 재활성화한다.
 *
 * 재활성화 체크리스트:
 *   1) dealer 화면에 "응대 시작" UI + PATCH /api/consultation_assignments/[id]/acknowledge 추가
 *   2) consultation_assignments INSERT 시 status='pending' 으로 되돌림 (assign route)
 *   3) vercel.json 의 crons 배열에 다시 추가
 *   4) 본 라우트의 410 short-circuit 제거
 *
 * 호출되더라도 410 Gone 으로 즉시 종료 — DB 작업·알림톡 모두 미수행.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(_request: NextRequest) {
  return NextResponse.json(
    {
      disabled: true,
      reason: "30분 자동 만료 시스템은 응대 흐름 도입 전까지 비활성화됨",
    },
    { status: 410 },
  );
}

// ─── 이하 기능 코드는 향후 재활성화를 위해 보존 (현재 미사용) ─────────────────
/* eslint-disable @typescript-eslint/no-unused-vars */

interface ExpiredRow {
  assignment_id: string;
  consultation_id: string;
  dealer_id: string;
}

async function _disabledHandler(request: NextRequest) {
  // 1. Vercel Cron 인증
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const sc = createServiceClient();

  // 2. 만료된 pending 배정을 expired로 전환 (RPC가 트랜잭션 처리)
  const { data: expired, error: expireError } = await sc.rpc(
    "expire_pending_assignments",
  );

  if (expireError) {
    console.error("[cron:consultation-timeout] RPC 실패:", expireError.message);
    return NextResponse.json({ error: "rpc failed" }, { status: 500 });
  }

  const rows = (expired ?? []) as ExpiredRow[];
  if (rows.length === 0) {
    return NextResponse.json({ processed: 0 });
  }

  // 3. 각 만료 행마다 consultation + dealer 정보 조회 → 알림톡 발송
  const adminPhones = parseAdminPhones();
  const adminLink = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://rebornlabs-admin.vercel.app"}/consultations`;

  let timeoutSent = 0;
  let cancelledSent = 0;

  for (const row of rows) {
    const [{ data: consultation }, { data: dealer }] = await Promise.all([
      sc
        .from("consultations")
        .select("customer_name")
        .eq("id", row.consultation_id)
        .maybeSingle(),
      sc
        .from("profiles")
        .select("name, phone")
        .eq("id", row.dealer_id)
        .maybeSingle(),
    ]);

    const customerName = consultation?.customer_name ?? "고객";
    const masked = maskCustomerName(customerName);
    const dealerName = dealer?.name ?? "딜러";
    const dealerPhone = dealer?.phone ?? null;

    // 운영자에게 timeout 알림
    for (const to of adminPhones) {
      const reassignLink = `${adminLink}/${row.consultation_id}`;
      const fmessage = `[리본랩스] ${masked}님 상담 ${dealerName} 30분 무응답으로 취소. 재배정 ${reassignLink}`;
      const result = await sendAlimtalk({
        template: "consultation.timeout_to_admin",
        to,
        variables: {
          "#{customer_name}": masked,
          "#{dealer_name}": dealerName,
          "#{reassign_link}": reassignLink,
        },
        fmessage,
        auditContext: {
          consultation_id: row.consultation_id,
          assignment_id: row.assignment_id,
        },
      }, sc);
      if (result.ok) timeoutSent += 1;
    }

    // 딜러에게 cancelled 알림
    if (dealerPhone) {
      const reason = "30분 무응답으로 자동 취소";
      const fmessage = `[리본랩스] ${masked}님 상담 배정 취소 (사유: ${reason})`;
      const result = await sendAlimtalk({
        template: "consultation.cancelled_to_dealer",
        to: dealerPhone,
        variables: {
          "#{customer_name}": masked,
          "#{reason}": reason,
        },
        fmessage,
        auditContext: {
          consultation_id: row.consultation_id,
          assignment_id: row.assignment_id,
        },
      }, sc);
      if (result.ok) cancelledSent += 1;
    }
  }

  return NextResponse.json({
    processed: rows.length,
    timeoutSent,
    cancelledSent,
  });
}

function parseAdminPhones(): string[] {
  const raw = process.env.ADMIN_PHONE_NUMBERS ?? process.env.ADMIN_PHONE_NUMBER ?? "";
  return raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
}
