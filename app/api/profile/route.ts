import { NextRequest, NextResponse } from "next/server";

import { AuthError, verifyUser, getAuthErrorMessage} from "@/lib/auth/verify";
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

export async function GET(request: NextRequest) {
  const token = extractToken(request);
  if (!token) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  try {
    const user = await verifyUser(token);
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
    currentUser = await verifyUser(token);
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

  const { name, phone, newPassword } = body;

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
