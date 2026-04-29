import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createServiceClient } from "@/lib/supabase/server";
import { verifyUser, requireRole, AuthError, getAuthErrorMessage} from "@/lib/auth/verify";

// ─── Zod 스키마 ───────────────────────────────────────────────

const CancelSaleSchema = z.object({
  reason: z
    .string()
    .min(1, "취소 사유는 필수입니다.")
    .max(500, "취소 사유는 500자를 초과할 수 없습니다."),
});

// ─── 헬퍼 ────────────────────────────────────────────────────

function extractToken(request: NextRequest): string {
  const authHeader = request.headers.get("Authorization") ?? "";
  return authHeader.replace(/^Bearer\s+/i, "");
}

type RouteContext = { params: Promise<{ id: string }> };

// ─── POST /api/sales/[id]/cancel — 판매 취소 ─────────────────

/**
 * 판매 취소 (admin/staff 전용).
 *
 * - dealer 차단
 * - body: { reason: string (1~500자) }
 * - cancel_sale RPC 호출 (service_role)
 * - RPC 에러 시 에러 메시지 그대로 반환
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id: saleId } = await context.params;
    const token = extractToken(request);
    const user = await verifyUser(token);

    // admin/staff만 허용 (dealer 차단)
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

    const parsed = CancelSaleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            parsed.error.errors[0]?.message ?? "입력 데이터가 올바르지 않습니다.",
        },
        { status: 400 },
      );
    }

    const serviceClient = createServiceClient();

    // 판매 존재 확인
    const { data: sale, error: saleError } = await serviceClient
      .from("sales")
      .select("id")
      .eq("id", saleId)
      .single();

    if (saleError || !sale) {
      return NextResponse.json(
        { error: "판매 정보를 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    // cancel_sale RPC 호출
    const { error: rpcError } = await serviceClient.rpc("cancel_sale", {
      p_sale_id: saleId,
      p_actor_id: user.id,
      p_reason: parsed.data.reason,
    });

    if (rpcError) {
      // DB 원문 메시지는 로그에만 — 클라이언트엔 일반 메시지로 마스킹.
      console.error(
        `[sales/${saleId}/cancel] cancel_sale RPC 실패:`,
        rpcError.message,
      );
      return NextResponse.json(
        { error: "판매 취소 처리 중 오류가 발생했습니다." },
        { status: 400 },
      );
    }

    return NextResponse.json({ message: "판매가 취소되었습니다." });
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
