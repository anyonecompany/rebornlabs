import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createSSRClient } from "@/lib/supabase/server-ssr";
import { createServiceClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

const LoginSchema = z.object({
  email: z.string().email("올바른 이메일 형식이 아닙니다.").max(254),
  password: z.string().min(1, "비밀번호를 입력해주세요.").max(128),
});

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "요청 데이터 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const parsed = LoginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "입력이 올바르지 않습니다." }, { status: 400 });
  }

  const { email, password } = parsed.data;

  // IP rate limiting (15분 내 10회 초과 차단)
  const serviceClient = createServiceClient();
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "0.0.0.0";
  const { count: loginAttempts } = await serviceClient
    .from("rate_limits")
    .select("*", { count: "exact", head: true })
    .eq("ip_address", ip)
    .eq("endpoint", "auth_login")
    .gte("requested_at", new Date(Date.now() - 15 * 60 * 1000).toISOString());

  if ((loginAttempts ?? 0) >= 10) {
    return NextResponse.json({ error: "너무 많은 로그인 시도입니다. 15분 후 다시 시도해주세요." }, { status: 429 });
  }
  await serviceClient.from("rate_limits").insert({ ip_address: ip, endpoint: "auth_login", requested_at: new Date().toISOString() });

  try {
    const supabase = await createSSRClient();

    const { data: authData, error: signInError } =
      await supabase.auth.signInWithPassword({ email, password });

    if (signInError || !authData.user) {
      return NextResponse.json(
        { error: "이메일 또는 비밀번호가 올바르지 않습니다." },
        { status: 401 },
      );
    }

    // service_role로 profiles 조회 (RLS bypass)
    const { data: profileData, error: profileError } = await serviceClient
      .from("profiles")
      .select("id, email, name, role, is_active, must_change_password")
      .eq("id", authData.user.id)
      .single();

    if (profileError || !profileData) {
      return NextResponse.json(
        { error: "사용자 정보를 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    const profile = profileData as unknown as Pick<
      ProfileRow,
      "id" | "email" | "name" | "role" | "is_active" | "must_change_password"
    >;

    if (!profile.is_active) {
      return NextResponse.json(
        { error: "비활성화된 계정입니다. 관리자에게 문의하세요." },
        { status: 403 },
      );
    }

    // 감사 로그 기록
    await serviceClient.from("audit_logs").insert({
      actor_id: profile.id,
      action: "user_login",
      target_type: "profile",
      target_id: profile.id,
      metadata: { email: profile.email },
    });

    const res = NextResponse.json({
      user: {
        id: profile.id,
        email: profile.email,
        name: profile.name,
        role: profile.role,
        mustChangePassword: profile.must_change_password,
      },
    });

    // 프로필 캐시 쿠키 설정 (미들웨어 DB 조회 스킵)
    res.cookies.set("x-profile-cache", encodeURIComponent(JSON.stringify({
      id: profile.id,
      name: profile.name,
      role: profile.role,
      email: profile.email,
      must_change_password: profile.must_change_password,
      ts: Date.now(),
    })), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      maxAge: 300,
      path: "/",
    });

    return res;
  } catch {
    return NextResponse.json(
      { error: "로그인 처리 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
