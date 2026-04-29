import { NextRequest, NextResponse } from "next/server";

import { AuthError, requireRole, verifyUser, getAuthErrorMessage} from "@/lib/auth/verify";
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

  try {
    const user = await verifyUser(token);
    requireRole(user, ["admin"]);
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServiceClient() as any;

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
  const currentUser = await verifyUser(token!);
  await supabase.from("audit_logs").insert({
    actor_id: currentUser.id,
    action: "role_changed",
    target_type: "profile",
    target_id: userId,
    metadata: { new_role: role },
  });

  return NextResponse.json({ success: true });
}
