import { NextRequest, NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/server";
import { verifyUser, requireRole, AuthError, getAuthErrorMessage } from "@/lib/auth/verify";
import { maskEmail } from "@/src/lib/mask-pii";

function extractToken(request: NextRequest): string {
  const authHeader = request.headers.get("Authorization") ?? "";
  const bearer = authHeader.replace(/^Bearer\s+/i, "");
  if (bearer) return bearer;
  return request.cookies.get("sb-access-token")?.value ?? "";
}

type RouteContext = { params: Promise<{ id: string }> };

/**
 * DELETE /api/users/[id]/delete — 사용자 삭제 (admin 전용)
 *
 * - 활성 상담/판매가 연결된 사용자는 삭제 차단
 * - auth.users + profiles 모두 삭제
 * - 감사 로그 기록
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id: userId } = await context.params;
    const token = extractToken(request);
    const user = await verifyUser(token);
    requireRole(user, ["admin"]);

    // 본인 삭제 차단
    if (userId === user.id) {
      return NextResponse.json(
        { error: "본인 계정은 삭제할 수 없습니다." },
        { status: 400 },
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const serviceClient = createServiceClient() as any;

    // 대상 사용자 존재 확인
    const { data: target, error: targetErr } = await serviceClient
      .from("profiles")
      .select("id, email, name, role")
      .eq("id", userId)
      .single();

    if (targetErr || !target) {
      return NextResponse.json(
        { error: "사용자를 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    // 마지막 활성 admin 삭제 차단
    if (target.role === "admin") {
      const { count: adminCount } = await serviceClient
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "admin")
        .eq("is_active", true);

      if ((adminCount ?? 0) <= 1) {
        return NextResponse.json(
          { error: "최소 1명의 admin이 필요합니다." },
          { status: 400 },
        );
      }
    }

    // 활성 상담 연결 확인 (assigned_dealer_id)
    const { count: activeConsultations } = await serviceClient
      .from("consultations")
      .select("id", { count: "exact", head: true })
      .eq("assigned_dealer_id", userId)
      .in("status", ["new", "consulting", "vehicle_waiting"]);

    if ((activeConsultations ?? 0) > 0) {
      return NextResponse.json(
        { error: "활성 상담이 배정된 사용자는 삭제할 수 없습니다." },
        { status: 409 },
      );
    }

    // 활성 판매 연결 확인
    const { count: activeSales } = await serviceClient
      .from("sales")
      .select("id", { count: "exact", head: true })
      .eq("dealer_id", userId)
      .is("cancelled_at", null);

    if ((activeSales ?? 0) > 0) {
      return NextResponse.json(
        { error: "활성 판매가 있는 사용자는 삭제할 수 없습니다." },
        { status: 409 },
      );
    }

    // profiles 삭제 (FK가 SET NULL이므로 관련 데이터 유지)
    const { error: profileErr } = await serviceClient
      .from("profiles")
      .delete()
      .eq("id", userId);

    if (profileErr) {
      return NextResponse.json(
        { error: "프로필 삭제에 실패했습니다." },
        { status: 500 },
      );
    }

    // auth.users 삭제
    const { error: authErr } = await serviceClient.auth.admin.deleteUser(userId);
    if (authErr) {
      return NextResponse.json(
        { error: "인증 계정 삭제에 실패했습니다." },
        { status: 500 },
      );
    }

    // 감사 로그 (email 추적성 유지, name은 첫 글자만 노출)
    const maskedName =
      target.name.length > 1
        ? `${target.name.slice(0, 1)}${"*".repeat(target.name.length - 1)}`
        : target.name;
    await serviceClient.from("audit_logs").insert({
      actor_id: user.id,
      action: "user_deleted",
      target_type: "profile",
      target_id: userId,
      metadata: { email: maskEmail(target.email), name: maskedName, role: target.role },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof AuthError) {
      const status = err.code === "NO_TOKEN" || err.code === "INVALID_TOKEN" ? 401 : 403;
      return NextResponse.json({ error: getAuthErrorMessage(err.code) }, { status });
    }
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
