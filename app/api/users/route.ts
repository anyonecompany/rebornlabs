import { NextResponse } from "next/server";
import { createSSRClient } from "@/lib/supabase/server-ssr";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * GET /api/users
 * 전체 사용자 목록 조회 (admin 전용)
 */
export async function GET() {
  try {
    const ssrClient = await createSSRClient();

    const {
      data: { user },
      error: authError,
    } = await ssrClient.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "인증이 필요합니다." },
        { status: 401 },
      );
    }

    // 역할 확인
    const { data: profile, error: profileError } = await ssrClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: "사용자 정보를 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    if (profile.role !== "admin") {
      return NextResponse.json(
        { error: "경영진 권한이 필요합니다." },
        { status: 403 },
      );
    }

    // service_role로 전체 조회 (RLS 우회)
    const serviceClient = createServiceClient();
    const { data: users, error: usersError } = await serviceClient
      .from("profiles")
      .select("id, email, name, phone, role, is_active, created_at")
      .order("created_at", { ascending: false });

    if (usersError) {
      return NextResponse.json(
        { error: "사용자 목록을 불러오지 못했습니다." },
        { status: 500 },
      );
    }

    return NextResponse.json({ users });
  } catch {
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
