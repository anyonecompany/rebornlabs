import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { AuthError, verifyUser, getAuthErrorMessage } from "@/lib/auth/verify";
import { createServiceClient } from "@/lib/supabase/server";

interface ProfileUpdateRequest {
  name?: string;
  phone?: string;
  currentPassword?: string;
  newPassword?: string;
}

function extractToken(request: NextRequest): string | null {
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  return request.cookies.get("sb-access-token")?.value ?? null;
}

/** anon key 클라이언트로 이메일+비밀번호 재인증 (currentPassword 검증) */
async function reauthenticateWithPassword(
  email: string,
  password: string,
): Promise<{ ok: boolean }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    throw new Error("Supabase 환경변수가 설정되지 않았습니다.");
  }

  const client = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error } = await client.auth.signInWithPassword({ email, password });
  return { ok: !error };
}

export async function GET(request: NextRequest) {
  const token = extractToken(request);
  if (!token) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  try {
    const user = await verifyUser(token, { allowMustChangePassword: true });
    const serviceClient = createServiceClient();
    const { data, error } = await serviceClient
      .from("profiles")
      .select("id, email, name, phone, role")
      .eq("id", user.id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "프로필을 찾을 수 없습니다." }, { status: 404 });
    }

    return NextResponse.json({ profile: data });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: getAuthErrorMessage(err.code) }, { status: 401 });
    }
    return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const token = extractToken(request);
  if (!token) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  let currentUser;
  try {
    currentUser = await verifyUser(token, { allowMustChangePassword: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: getAuthErrorMessage(err.code) }, { status: 401 });
    }
    return NextResponse.json(
      { error: "인증 처리 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }

  let body: ProfileUpdateRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "요청 데이터 형식이 올바르지 않습니다." },
      { status: 400 },
    );
  }

  const { name, phone, currentPassword, newPassword } = body;

  try {
    const serviceClient = createServiceClient();

    if (name !== undefined || phone !== undefined) {
      const profileUpdate: Record<string, string | null> = {};
      if (name !== undefined) profileUpdate.name = name;
      if (phone !== undefined) profileUpdate.phone = phone;

      const { error: profileError } = await serviceClient
        .from("profiles")
        .update(profileUpdate)
        .eq("id", currentUser.id);

      if (profileError) {
        return NextResponse.json(
          { error: "프로필 업데이트 중 오류가 발생했습니다." },
          { status: 500 },
        );
      }
    }

    if (newPassword) {
      // currentPassword 검증 필수
      if (!currentPassword) {
        return NextResponse.json(
          { error: "비밀번호 변경 시 현재 비밀번호를 입력해야 합니다." },
          { status: 400 },
        );
      }

      // 이메일 조회 (재인증용)
      const { data: profileData, error: profileFetchError } = await serviceClient
        .from("profiles")
        .select("email")
        .eq("id", currentUser.id)
        .single();

      if (profileFetchError || !profileData?.email) {
        return NextResponse.json(
          { error: "사용자 정보를 불러올 수 없습니다." },
          { status: 500 },
        );
      }

      // signInWithPassword로 현재 비밀번호 재인증
      const { ok: verified } = await reauthenticateWithPassword(
        profileData.email,
        currentPassword,
      );

      if (!verified) {
        return NextResponse.json(
          { error: "현재 비밀번호가 올바르지 않습니다." },
          { status: 400 },
        );
      }

      // 비밀번호 변경 (service_role admin API)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: passwordError } = await (serviceClient as any).auth.admin.updateUserById(
        currentUser.id,
        { password: newPassword },
      );

      if (passwordError) {
        return NextResponse.json(
          { error: "비밀번호 변경 중 오류가 발생했습니다." },
          { status: 500 },
        );
      }

      await serviceClient
        .from("profiles")
        .update({ must_change_password: false })
        .eq("id", currentUser.id);
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "프로필 업데이트 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
