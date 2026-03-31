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
 * PATCH /api/marketing-companies/[id]
 * 마케팅업체 수정 (admin만)
 * body: { name?: string, is_active?: boolean }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const token = extractToken(request);
    const user = await verifyUser(token);
    requireRole(user, ["admin"]);

    const { id } = await params;
    const body = await request.json();

    const updates: Record<string, unknown> = {};
    if (typeof body.name === "string") {
      const trimmed = body.name.trim();
      if (!trimmed) {
        return NextResponse.json(
          { error: "업체명을 입력해주세요." },
          { status: 400 },
        );
      }
      updates.name = trimmed;
    }
    if (typeof body.is_active === "boolean") {
      updates.is_active = body.is_active;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "수정할 내용이 없습니다." },
        { status: 400 },
      );
    }

    const serviceClient = createServiceClient();

    const { data, error } = await serviceClient
      .from("marketing_companies")
      .update(updates)
      .eq("id", id)
      .select("id, name, is_active, created_at")
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: "업체 수정에 실패했습니다." },
        { status: 500 },
      );
    }

    return NextResponse.json({ data });
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
