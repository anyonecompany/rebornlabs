import { NextRequest, NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/server";
import { sendAlimtalk } from "@/lib/alimtalk/send";
import { maskCustomerName } from "@/lib/alimtalk/templates";

/**
 * 30분 무응답 배정 자동 만료 + 알림 Cron.
 *
 * 호출 경로:
 *   Vercel Cron(1분 간격) → GET /api/cron/consultation-timeout
 *   Authorization: Bearer ${CRON_SECRET} 헤더가 일치할 때만 실행.
 *
 * 동작:
 *   1) expire_pending_assignments() RPC 호출 → 만료된 (assignment, consultation, dealer) 행 반환
 *      트리거가 자동으로 status='expired' 전환 + audit_logs 기록.
 *   2) 각 행에 대해 운영자(ADMIN_PHONE_NUMBERS)에게 timeout 알림톡 발송.
 *   3) 미응답 딜러에게 cancelled 알림톡 발송.
 *
 * 마이그레이션 009 미적용 시: RPC 호출 실패 → 0건 반환.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface ExpiredRow {
  assignment_id: string;
  consultation_id: string;
  dealer_id: string;
}

export async function GET(request: NextRequest) {
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
