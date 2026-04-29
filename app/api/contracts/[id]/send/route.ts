import { NextRequest, NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/server";
import { verifyUser, AuthError, getAuthErrorMessage } from "@/lib/auth/verify";

// ─── 헬퍼 ────────────────────────────────────────────────────

function extractToken(request: NextRequest): string {
  const authHeader = request.headers.get("Authorization") ?? "";
  return authHeader.replace(/^Bearer\s+/i, "");
}

type RouteContext = { params: Promise<{ id: string }> };

// ─── POST /api/contracts/[id]/send — 서명 요청 발송 ──────────

/**
 * 계약서 서명 요청 이메일 발송.
 *
 * - 인증 필수
 * - contracts 조회 → status가 draft여야 함
 * - GAS 웹훅으로 이메일 발송 (fire-and-forget)
 * - status → 'sent'로 UPDATE
 * - GAS 실패해도 status는 sent로 변경 (링크 직접 공유 가능)
 * - 성공: 200 { signUrl }
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const token = extractToken(request);
    const user = await verifyUser(token);

    const serviceClient = createServiceClient();

    // 계약서 조회
    const { data: contract, error: contractError } = await serviceClient
      .from("contracts")
      .select(
        "id, sale_id, token, status, customer_name, customer_email, vehicle_info",
      )
      .eq("id", id)
      .single();

    if (contractError || !contract) {
      return NextResponse.json(
        { error: "계약서를 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    if (contract.status !== "draft") {
      return NextResponse.json(
        { error: "이미 발송되었거나 서명 완료된 계약서입니다." },
        { status: 400 },
      );
    }

    // dealer: 본인 판매 건인지 확인
    if (user.role === "dealer") {
      const { data: sale, error: saleError } = await serviceClient
        .from("sales")
        .select("dealer_id")
        .eq("id", contract.sale_id)
        .single();

      if (saleError || !sale) {
        return NextResponse.json(
          { error: "판매 정보를 찾을 수 없습니다." },
          { status: 404 },
        );
      }

      if (sale.dealer_id !== user.id) {
        return NextResponse.json(
          { error: "접근 권한이 없습니다." },
          { status: 403 },
        );
      }
    }

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? "https://rebornlabs-admin.vercel.app";
    const signUrl = `${appUrl}/sign/${contract.token}`;

    // GAS 웹훅 호출 (fire-and-forget — 실패해도 계속 진행)
    const gasWebhookUrl = process.env.GAS_WEBHOOK_URL;
    if (gasWebhookUrl) {
      fetch(gasWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send_contract",
          email: contract.customer_email,
          customerName: contract.customer_name,
          vehicleInfo: contract.vehicle_info,
          signUrl,
        }),
      }).catch(() => {
        // fire-and-forget: 실패 로그는 남기지 않음 (Next.js 서버 로그에 남음)
      });
    }

    // status → 'sent'
    const { error: updateError } = await serviceClient
      .from("contracts")
      .update({ status: "sent" })
      .eq("id", id);

    if (updateError) {
      return NextResponse.json(
        { error: "계약서 상태 업데이트에 실패했습니다." },
        { status: 500 },
      );
    }

    return NextResponse.json({ signUrl });
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
