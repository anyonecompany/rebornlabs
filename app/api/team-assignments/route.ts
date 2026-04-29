import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createServiceClient } from "@/lib/supabase/server";
import { verifyUser, AuthError, getAuthErrorMessage} from "@/lib/auth/verify";

// ─── 스키마 ───────────────────────────────────────────────────

const AssignmentSchema = z.object({
  userId: z.string().uuid("유효한 사용자 ID가 필요합니다."),
  leaderId: z.string().uuid("유효한 상위 리더 ID가 필요합니다."),
  leaderType: z.enum(["team_leader", "director"]),
});

// ─── 헬퍼 ────────────────────────────────────────────────────

function extractToken(request: NextRequest): string {
  const authHeader = request.headers.get("Authorization") ?? "";
  return authHeader.replace(/^Bearer\s+/i, "");
}

// ─── GET /api/team-assignments ───────────────────────────────
// 전체 배치 목록. admin/staff 전체, director/team_leader 본인 관련.

export async function GET(request: NextRequest) {
  try {
    const token = extractToken(request);
    const user = await verifyUser(token);

    const role = user.role as string;
    if (!["admin", "staff", "director", "team_leader"].includes(role)) {
      return NextResponse.json(
        { error: "조회 권한이 없습니다." },
        { status: 403 },
      );
    }

    const serviceClient = createServiceClient();
    let query = serviceClient
      .from("team_assignments")
      .select("id, user_id, leader_id, leader_type, created_at")
      .order("created_at", { ascending: true });

    if (role === "director" || role === "team_leader") {
      query = query.or(`leader_id.eq.${user.id},user_id.eq.${user.id}`);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json(
        { error: "배치 목록을 불러오지 못했습니다." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      assignments: (data ?? []).map((a) => ({
        id: a.id,
        userId: a.user_id,
        leaderId: a.leader_id,
        leaderType: a.leader_type,
        createdAt: a.created_at,
      })),
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

// ─── POST /api/team-assignments — 배치 생성 ─────────────────
// admin만. 역할 정합성 검증:
//   - leaderType='team_leader' → user는 dealer, leader는 team_leader
//   - leaderType='director'    → user는 team_leader, leader는 director

export async function POST(request: NextRequest) {
  try {
    const token = extractToken(request);
    const user = await verifyUser(token);

    if (user.role !== "admin") {
      return NextResponse.json(
        { error: "배치 생성은 경영진만 가능합니다." },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const parsed = AssignmentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            parsed.error.issues[0]?.message ?? "요청 형식이 올바르지 않습니다.",
        },
        { status: 400 },
      );
    }

    const { userId, leaderId, leaderType } = parsed.data;
    if (userId === leaderId) {
      return NextResponse.json(
        { error: "자기 자신을 상위 리더로 지정할 수 없습니다." },
        { status: 400 },
      );
    }

    const serviceClient = createServiceClient();

    // 두 사용자의 role 조회하여 정합성 검증
    const { data: profiles, error: profilesError } = await serviceClient
      .from("profiles")
      .select("id, role, is_active, name")
      .in("id", [userId, leaderId]);

    if (profilesError || !profiles || profiles.length !== 2) {
      return NextResponse.json(
        { error: "사용자 정보를 불러오지 못했습니다." },
        { status: 400 },
      );
    }

    const userProfile = profiles.find((p) => p.id === userId);
    const leaderProfile = profiles.find((p) => p.id === leaderId);
    if (!userProfile || !leaderProfile) {
      return NextResponse.json(
        { error: "사용자를 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    if (!userProfile.is_active || !leaderProfile.is_active) {
      return NextResponse.json(
        { error: "비활성 사용자는 배치할 수 없습니다." },
        { status: 400 },
      );
    }

    if (leaderType === "team_leader") {
      if (userProfile.role !== "dealer") {
        return NextResponse.json(
          { error: "딜러만 팀장 밑으로 배치할 수 있습니다." },
          { status: 400 },
        );
      }
      if (leaderProfile.role !== "team_leader") {
        return NextResponse.json(
          { error: "팀장 역할을 가진 사용자를 지정해 주세요." },
          { status: 400 },
        );
      }
    } else if (leaderType === "director") {
      if (userProfile.role !== "team_leader") {
        return NextResponse.json(
          { error: "팀장만 본부장 밑으로 배치할 수 있습니다." },
          { status: 400 },
        );
      }
      if (leaderProfile.role !== "director") {
        return NextResponse.json(
          { error: "본부장 역할을 가진 사용자를 지정해 주세요." },
          { status: 400 },
        );
      }
    }

    // 중복 체크 (UNIQUE user_id, leader_type)
    const { data: existing } = await serviceClient
      .from("team_assignments")
      .select("id")
      .eq("user_id", userId)
      .eq("leader_type", leaderType)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        {
          error:
            leaderType === "team_leader"
              ? "이미 팀장에 배치되어 있습니다. 먼저 해제해 주세요."
              : "이미 본부장에 배치되어 있습니다. 먼저 해제해 주세요.",
        },
        { status: 409 },
      );
    }

    const { data: inserted, error: insertError } = await serviceClient
      .from("team_assignments")
      .insert({
        user_id: userId,
        leader_id: leaderId,
        leader_type: leaderType,
      })
      .select("id, user_id, leader_id, leader_type, created_at")
      .single();

    if (insertError || !inserted) {
      return NextResponse.json(
        { error: "배치 저장에 실패했습니다." },
        { status: 500 },
      );
    }

    // 감사 로그
    await serviceClient.from("audit_logs").insert({
      actor_id: user.id,
      action: "team_assignment_created",
      target_type: "profile",
      target_id: userId,
      metadata: {
        leader_id: leaderId,
        leader_type: leaderType,
        user_name: userProfile.name,
        leader_name: leaderProfile.name,
      },
    });

    return NextResponse.json({
      assignment: {
        id: inserted.id,
        userId: inserted.user_id,
        leaderId: inserted.leader_id,
        leaderType: inserted.leader_type,
        createdAt: inserted.created_at,
      },
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
