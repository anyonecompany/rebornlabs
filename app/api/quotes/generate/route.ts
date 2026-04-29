import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createServiceClient } from "@/lib/supabase/server";
import { verifyUser, AuthError, getAuthErrorMessage } from "@/lib/auth/verify";

// ─── 스키마 ───────────────────────────────────────────────────

const GenerateSchema = z.object({
  vehicleId: z.string().uuid("유효한 차량 ID가 필요합니다."),
  expiresInDays: z.number().int().min(1).max(365).nullable().optional(),
  force: z.boolean().optional(),
});

// ─── 헬퍼 ────────────────────────────────────────────────────

function extractToken(request: NextRequest): string {
  const authHeader = request.headers.get("Authorization") ?? "";
  return authHeader.replace(/^Bearer\s+/i, "");
}

function generateToken(): string {
  return randomBytes(32).toString("hex");
}

function computeExpiresAt(expiresInDays: number | null | undefined): string | null {
  if (expiresInDays === null || expiresInDays === undefined) {
    return addDaysFromNow(7);
  }
  return addDaysFromNow(expiresInDays);
}

function addDaysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function buildPublicUrl(request: NextRequest, token: string): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ??
    request.headers.get("origin") ??
    `${request.nextUrl.protocol}//${request.nextUrl.host}`;
  return `${base.replace(/\/$/, "")}/quote/${token}`;
}

// ─── POST /api/quotes/generate ───────────────────────────────
//
// 인증된 사용자(admin/staff/dealer)가 차량 견적서 링크를 생성.
// - expiresInDays null → 기본 7일
// - 동일 (vehicle, dealer) 활성 견적이 있으면 재사용 (force=true 시 새로 발급)

export async function POST(request: NextRequest) {
  try {
    const token = extractToken(request);
    const user = await verifyUser(token);

    if (!["admin", "staff", "director", "team_leader", "dealer"].includes(user.role)) {
      return NextResponse.json(
        { error: "견적서 생성 권한이 없습니다." },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const parsed = GenerateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "요청 형식이 올바르지 않습니다." },
        { status: 400 },
      );
    }

    const { vehicleId, expiresInDays, force } = parsed.data;
    const serviceClient = createServiceClient();

    // 1. 차량 존재 확인 (삭제 안 된 차량만) — 가격 snapshot용 컬럼 포함
    const { data: vehicle, error: vehicleError } = await serviceClient
      .from("vehicles")
      .select("id, vehicle_code, selling_price, deposit, monthly_payment")
      .eq("id", vehicleId)
      .is("deleted_at", null)
      .single();

    if (vehicleError || !vehicle) {
      return NextResponse.json(
        { error: "차량을 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    // 2. 기존 활성 견적 확인 (force=true면 건너뜀)
    if (!force) {
      const nowIso = new Date().toISOString();
      const { data: existing } = await serviceClient
        .from("quotes")
        .select("id, token, quote_number, expires_at, created_at")
        .eq("vehicle_id", vehicleId)
        .eq("dealer_id", user.id)
        .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existing) {
        return NextResponse.json({
          quoteId: existing.id,
          quoteNumber: existing.quote_number,
          url: buildPublicUrl(request, existing.token),
          expiresAt: existing.expires_at,
          isExisting: true,
        });
      }
    }

    // 3. 신규 생성 (UNIQUE 충돌 시 1회 재시도)
    const MAX_ATTEMPTS = 2;
    let attempt = 0;
    let lastError: unknown = null;

    while (attempt < MAX_ATTEMPTS) {
      attempt++;

      // 견적번호 생성
      const { data: numberResult, error: numberError } = await serviceClient
        .rpc("generate_quote_number");

      if (numberError || !numberResult) {
        return NextResponse.json(
          { error: "견적번호 생성에 실패했습니다." },
          { status: 500 },
        );
      }

      const quoteNumber = numberResult as string;
      const quoteToken = generateToken();
      const expiresAt = computeExpiresAt(expiresInDays);

      const { data: inserted, error: insertError } = await serviceClient
        .from("quotes")
        .insert({
          vehicle_id: vehicleId,
          dealer_id: user.id,
          token: quoteToken,
          quote_number: quoteNumber,
          expires_at: expiresAt,
          // 발행 시점 가격 snapshot — 이후 vehicles 가격 변경에 영향받지 않음
          quoted_selling_price: vehicle.selling_price,
          quoted_deposit: vehicle.deposit ?? null,
          quoted_monthly_payment: vehicle.monthly_payment ?? null,
        })
        .select("id, token, quote_number, expires_at")
        .single();

      if (insertError) {
        // 23505 = unique_violation (번호 or 토큰 충돌)
        const code = (insertError as { code?: string }).code;
        if (code === "23505" && attempt < MAX_ATTEMPTS) {
          lastError = insertError;
          continue;
        }
        return NextResponse.json(
          { error: "견적서 저장에 실패했습니다." },
          { status: 500 },
        );
      }

      return NextResponse.json({
        quoteId: inserted.id,
        quoteNumber: inserted.quote_number,
        url: buildPublicUrl(request, inserted.token),
        expiresAt: inserted.expires_at,
        isExisting: false,
      });
    }

    return NextResponse.json(
      {
        error: "견적서 저장에 실패했습니다.",
        detail: (lastError as Error)?.message ?? "재시도 한도 초과",
      },
      { status: 500 },
    );
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
