import crypto from "crypto";

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { verifyUser, requireRole, AuthError } from "@/lib/auth/verify";

/**
 * 6자 영숫자 랜덤 ref_code 생성.
 * crypto.randomBytes(3) = 3바이트 = hex 6자 (소문자) → /^[a-f0-9]{6}$/.
 * 36^6 ≈ 22억 조합. SNS 노출 후에도 다른 코드 추측 불가능 수준.
 */
function generateRefCode(): string {
  return crypto.randomBytes(3).toString("hex");
}

function extractToken(request: NextRequest): string {
  const authHeader = request.headers.get("Authorization") ?? "";
  const bearer = authHeader.replace(/^Bearer\s+/i, "");
  if (bearer) return bearer;
  return request.cookies.get("sb-access-token")?.value ?? "";
}

/**
 * GET /api/marketing-companies
 * 마케팅업체 목록 조회 (admin, staff)
 * query: is_active=true|false — 활성 여부 필터 (미지정 시 전체)
 */
export async function GET(request: NextRequest) {
  try {
    const token = extractToken(request);
    const user = await verifyUser(token);
    requireRole(user, ["admin", "staff"]);

    const serviceClient = createServiceClient();
    const { searchParams } = new URL(request.url);
    const isActiveParam = searchParams.get("is_active");

    let query = serviceClient
      .from("marketing_companies")
      .select("id, name, is_active, ref_code, created_at")
      .order("name", { ascending: true });

    if (isActiveParam === "true") {
      query = query.eq("is_active", true);
    } else if (isActiveParam === "false") {
      query = query.eq("is_active", false);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json(
        { error: "마케팅업체 목록을 불러오지 못했습니다." },
        { status: 500 },
      );
    }

    return NextResponse.json({ data: data ?? [] });
  } catch (err) {
    if (err instanceof AuthError) {
      const status =
        err.code === "NO_TOKEN" || err.code === "INVALID_TOKEN" ? 401 : 403;
      return NextResponse.json({ error: err.message }, { status });
    }
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}

/**
 * POST /api/marketing-companies
 * 마케팅업체 등록 (admin만)
 * body: { name: string }
 */
export async function POST(request: NextRequest) {
  try {
    const token = extractToken(request);
    const user = await verifyUser(token);
    requireRole(user, ["admin"]);

    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";

    if (!name) {
      return NextResponse.json(
        { error: "업체명을 입력해주세요." },
        { status: 400 },
      );
    }

    const serviceClient = createServiceClient();

    // 중복 체크
    const { data: existing } = await serviceClient
      .from("marketing_companies")
      .select("id")
      .eq("name", name)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: "이미 등록된 업체명입니다." },
        { status: 409 },
      );
    }

    // 6자 ref_code 자동 생성. UNIQUE 충돌 시 1회 재시도.
    let refCode = generateRefCode();
    let inserted: {
      id: string;
      name: string;
      is_active: boolean;
      ref_code: string;
      created_at: string;
    } | null = null;
    let lastErr: { message: string } | null = null;

    for (let attempt = 0; attempt < 2; attempt++) {
      const { data, error } = await serviceClient
        .from("marketing_companies")
        .insert({ name, is_active: true, ref_code: refCode })
        .select("id, name, is_active, ref_code, created_at")
        .single();

      if (data) {
        inserted = data;
        break;
      }
      lastErr = error;
      // PostgreSQL UNIQUE 위반 코드: 23505. ref_code 충돌이면 새로 뽑아 재시도.
      if (error && (error as { code?: string }).code === "23505") {
        refCode = generateRefCode();
        continue;
      }
      break;
    }

    if (!inserted) {
      return NextResponse.json(
        {
          error: "업체 등록에 실패했습니다.",
          detail: lastErr?.message ?? undefined,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({ data: inserted }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) {
      const status =
        err.code === "NO_TOKEN" || err.code === "INVALID_TOKEN" ? 401 : 403;
      return NextResponse.json({ error: err.message }, { status });
    }
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
