import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createServiceClient } from "@/lib/supabase/server";
import { verifyUser, AuthError, getAuthErrorMessage } from "@/lib/auth/verify";
import { toKstEndOfDay } from "@/lib/kst";

// ─── 스키마 ───────────────────────────────────────────────────

const ExtendSchema = z.object({
  addDays: z.number().int().min(1).max(365).nullable(),
});

// ─── 헬퍼 ────────────────────────────────────────────────────

function extractToken(request: NextRequest): string {
  const authHeader = request.headers.get("Authorization") ?? "";
  return authHeader.replace(/^Bearer\s+/i, "");
}

type RouteContext = { params: Promise<{ id: string }> };

// ─── POST /api/quotes/extend/[id] — 만료 연장 ────────────────
//
// Body: { addDays: number | null }
//   - addDays > 0: max(expires_at, now()) + addDays
//   - addDays === null: expires_at = NULL (무제한)
//
// 권한: admin/staff 또는 본인 생성 dealer 만 연장 가능

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const token = extractToken(request);
    const user = await verifyUser(token);

    const role = user.role as string;
    if (!["admin", "staff", "dealer"].includes(role)) {
      return NextResponse.json(
        { error: "연장 권한이 없습니다." },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const parsed = ExtendSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.issues[0]?.message ?? "요청 형식이 올바르지 않습니다.",
        },
        { status: 400 },
      );
    }

    const { addDays } = parsed.data;

    const serviceClient = createServiceClient();

    // 1. 견적 조회 + 소유권 확인
    const { data: quote, error: fetchError } = await serviceClient
      .from("quotes")
      .select("id, dealer_id, expires_at")
      .eq("id", id)
      .maybeSingle();

    if (fetchError || !quote) {
      return NextResponse.json(
        { error: "견적서를 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    const isOwner = quote.dealer_id === user.id;
    const isPrivileged =
      role === "admin" ||
      role === "staff" ||
      role === "director" ||
      role === "team_leader";
    if (!isPrivileged && !isOwner) {
      return NextResponse.json(
        { error: "이 견적서의 만료를 연장할 권한이 없습니다." },
        { status: 403 },
      );
    }

    // 2. 새 expires_at 계산 (KST 23:59:59 기준으로 정규화)
    let newExpiresAt: string | null;
    if (addDays === null) {
      newExpiresAt = null;
    } else {
      const now = Date.now();
      const baseMs = quote.expires_at
        ? Math.max(new Date(quote.expires_at).getTime(), now)
        : now;
      // KST 자정(23:59:59.999) 기준으로 정규화 — 사용자가 "3일 연장"할 때
      // 현재 시각 기준이 아닌 KST 해당 날 마지막 순간까지 유효하도록 처리
      newExpiresAt = toKstEndOfDay(baseMs, addDays);
    }

    // 3. 업데이트
    const { data: updated, error: updateError } = await serviceClient
      .from("quotes")
      .update({ expires_at: newExpiresAt })
      .eq("id", id)
      .select("id, expires_at")
      .single();

    if (updateError || !updated) {
      return NextResponse.json(
        { error: "만료 연장에 실패했습니다." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      quote: { id: updated.id, expiresAt: updated.expires_at },
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
