import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { verifyUser, requireRole, AuthError } from "@/lib/auth/verify";

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
      .select("id, name, is_active, created_at")
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

    const { data, error } = await serviceClient
      .from("marketing_companies")
      .insert({ name, is_active: true })
      .select("id, name, is_active, created_at")
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: "업체 등록에 실패했습니다." },
        { status: 500 },
      );
    }

    return NextResponse.json({ data }, { status: 201 });
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
