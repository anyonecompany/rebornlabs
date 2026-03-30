import { NextRequest, NextResponse } from "next/server";

import { createSSRClient } from "@/lib/supabase/server-ssr";
import type { Database } from "@/types/database";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

interface LoginRequest {
  email: string;
  password: string;
}

export async function POST(request: NextRequest) {
  let body: LoginRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "요청 데이터 형식이 올바르지 않습니다." },
      { status: 400 },
    );
  }

  const { email, password } = body;
  if (!email || !password) {
    return NextResponse.json(
      { error: "이메일과 비밀번호를 입력해주세요." },
      { status: 400 },
    );
  }

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

    const { data: profileData, error: profileError } = await supabase
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

    return NextResponse.json({
      user: {
        id: profile.id,
        email: profile.email,
        name: profile.name,
        role: profile.role,
        mustChangePassword: profile.must_change_password,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "로그인 처리 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
