import { NextRequest, NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/server";
import { verifyUser, AuthError, getAuthErrorMessage} from "@/lib/auth/verify";

function extractToken(request: NextRequest): string {
  const authHeader = request.headers.get("Authorization") ?? "";
  return authHeader.replace(/^Bearer\s+/i, "");
}

type RouteContext = { params: Promise<{ id: string }> };

// ─── DELETE /api/team-assignments/[id] — 배치 해제 ─────────────
// admin 전용. 감사 로그 기록.

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const token = extractToken(request);
    const user = await verifyUser(token);

    if (user.role !== "admin") {
      return NextResponse.json(
        { error: "배치 해제는 경영진만 가능합니다." },
        { status: 403 },
      );
    }

    const serviceClient = createServiceClient();

    const { data: existing, error: fetchError } = await serviceClient
      .from("team_assignments")
      .select("id, user_id, leader_id, leader_type")
      .eq("id", id)
      .maybeSingle();

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: "배치 정보를 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    const { error: deleteError } = await serviceClient
      .from("team_assignments")
      .delete()
      .eq("id", id);

    if (deleteError) {
      return NextResponse.json(
        { error: "배치 해제에 실패했습니다." },
        { status: 500 },
      );
    }

    await serviceClient.from("audit_logs").insert({
      actor_id: user.id,
      action: "team_assignment_deleted",
      target_type: "profile",
      target_id: existing.user_id,
      metadata: {
        leader_id: existing.leader_id,
        leader_type: existing.leader_type,
      },
    });

    return NextResponse.json({ success: true });
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
