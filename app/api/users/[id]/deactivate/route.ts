import { NextRequest, NextResponse } from "next/server";

import { AuthError, requireRole, verifyUser, getAuthErrorMessage } from "@/lib/auth/verify";
import { createServiceClient } from "@/lib/supabase/server";

function extractToken(request: NextRequest): string | null {
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  return request.cookies.get("sb-access-token")?.value ?? null;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const token = extractToken(request);
  if (!token) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  // 인증 + admin 권한 확인 (verifyUser 1회만 호출)
  let currentUser;
  try {
    currentUser = await verifyUser(token);
    requireRole(currentUser, ["admin"]);
  } catch (err) {
    if (err instanceof AuthError) {
      const status = err.code === "NO_TOKEN" ? 401 : 403;
      return NextResponse.json({ error: getAuthErrorMessage(err.code) }, { status });
    }
    return NextResponse.json(
      { error: "인증 처리 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }

  const { id: userId } = await params;

  // 자기 자신 비활성화 차단
  if (userId === currentUser.id) {
    return NextResponse.json(
      { error: "본인 계정은 비활성화할 수 없습니다. 다른 admin이 처리해 주세요." },
      { status: 400 },
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServiceClient() as any;

  // 마지막 활성 admin 비활성화 차단
  const { data: target, error: targetErr } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  if (targetErr || !target) {
    return NextResponse.json({ error: "사용자를 찾을 수 없습니다." }, { status: 404 });
  }

  if (target.role === "admin") {
    const { count } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin")
      .eq("is_active", true);

    if ((count ?? 0) <= 1) {
      return NextResponse.json(
        { error: "최소 1명의 활성 admin이 필요합니다." },
        { status: 400 },
      );
    }
  }

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ is_active: false })
    .eq("id", userId);

  if (updateError) {
    return NextResponse.json(
      { error: "계정 비활성화 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }

  await supabase.auth.admin.signOut(userId);

  return NextResponse.json({ success: true });
}
