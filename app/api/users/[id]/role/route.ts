import { NextRequest, NextResponse } from "next/server";

import { AuthError, requireCapability, verifyUser, getAuthErrorMessage } from "@/lib/auth/verify";
import { createServiceClient } from "@/lib/supabase/server";

interface RoleUpdateRequest {
  role: "admin" | "director" | "team_leader" | "staff" | "dealer";
}

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
    requireCapability(currentUser, "users:write");
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

  let body: RoleUpdateRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "요청 데이터 형식이 올바르지 않습니다." },
      { status: 400 },
    );
  }

  const { role } = body;
  if (!["admin", "director", "team_leader", "staff", "dealer"].includes(role)) {
    return NextResponse.json(
      { error: "유효하지 않은 역할입니다." },
      { status: 400 },
    );
  }

  const { id: userId } = await params;

  // 자기 자신 강등 차단
  if (userId === currentUser.id && role !== "admin") {
    return NextResponse.json(
      { error: "본인의 admin 역할은 강등할 수 없습니다. 다른 admin이 변경해 주세요." },
      { status: 400 },
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServiceClient() as any;

  // 마지막 admin 보호 (대상이 admin → admin 아닌 역할로 변경 시)
  const { data: target, error: targetErr } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  if (targetErr || !target) {
    return NextResponse.json({ error: "사용자를 찾을 수 없습니다." }, { status: 404 });
  }

  if (target.role === "admin" && role !== "admin") {
    const { count } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin")
      .eq("is_active", true);

    if ((count ?? 0) <= 1) {
      return NextResponse.json(
        { error: "최소 1명의 admin이 필요합니다." },
        { status: 400 },
      );
    }
  }

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ role })
    .eq("id", userId);

  if (updateError) {
    return NextResponse.json(
      { error: "역할 업데이트 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }

  await supabase.auth.admin.signOut(userId);

  // 감사 로그 기록
  await supabase.from("audit_logs").insert({
    actor_id: currentUser.id,
    action: "role_changed",
    target_type: "profile",
    target_id: userId,
    metadata: { new_role: role },
  });

  return NextResponse.json({ success: true });
}
