import crypto from "crypto";

import { NextRequest, NextResponse } from "next/server";

import { AuthError, requireRole, verifyUser } from "@/lib/auth/verify";
import { createServiceClient } from "@/lib/supabase/server";

interface InviteRequest {
  email: string;
  name: string;
  role: "admin" | "staff" | "dealer";
  phone?: string;
}

function generateTemporaryPassword(): string {
  const base = crypto.randomBytes(9).toString("base64url").slice(0, 12);
  const letter = String.fromCharCode(65 + Math.floor(Math.random() * 26));
  const digit = String(Math.floor(Math.random() * 10));
  return base.slice(0, 10) + letter + digit;
}

function extractToken(request: NextRequest): string | null {
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  return request.cookies.get("sb-access-token")?.value ?? null;
}

export async function POST(request: NextRequest) {
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
      return NextResponse.json({ error: err.message }, { status });
    }
    return NextResponse.json(
      { error: "인증 처리 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }

  let body: InviteRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "요청 데이터 형식이 올바르지 않습니다." },
      { status: 400 },
    );
  }

  const { email, name, role, phone } = body;
  if (!email || !name || !role) {
    return NextResponse.json(
      { error: "email, name, role은 필수입니다." },
      { status: 400 },
    );
  }
  if (!["admin", "staff", "dealer"].includes(role)) {
    return NextResponse.json(
      { error: "유효하지 않은 역할입니다." },
      { status: 400 },
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServiceClient() as any;
  const temporaryPassword = generateTemporaryPassword();

  const { data: authData, error: createError } =
    await supabase.auth.admin.createUser({
      email,
      password: temporaryPassword,
      email_confirm: true,
    });

  if (createError) {
    if (createError.message.includes("already been registered")) {
      return NextResponse.json(
        { error: "이미 등록된 이메일입니다." },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: "사용자 생성 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }

  const { error: profileError } = await supabase.from("profiles").insert({
    id: authData.user.id,
    email,
    name,
    phone: phone ?? null,
    role,
    is_active: true,
    must_change_password: true,
  });

  if (profileError) {
    await supabase.auth.admin.deleteUser(authData.user.id);
    return NextResponse.json(
      { error: "프로필 생성 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }

  // 감사 로그 기록
  const currentUser = await verifyUser(token!);
  await supabase.from("audit_logs").insert({
    actor_id: currentUser.id,
    action: "user_invited",
    target_type: "profile",
    target_id: authData.user.id,
    metadata: { email, name, role },
  });

  // GAS로 초대 이메일 발송 (fire-and-forget)
  const gasUrl = process.env.GAS_WEBHOOK_URL;
  if (gasUrl) {
    const ROLE_LABELS: Record<string, string> = { admin: "경영진", staff: "직원", dealer: "딜러" };
    fetch(gasUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "invite_user",
        email,
        name,
        role: ROLE_LABELS[role] ?? role,
        tempPassword: temporaryPassword,
        loginUrl: process.env.NEXT_PUBLIC_APP_URL
          ? `${process.env.NEXT_PUBLIC_APP_URL}/login`
          : "https://rebornlabs-admin.vercel.app/login",
      }),
    }).catch(() => {});
  }

  return NextResponse.json({
    user: { id: authData.user.id, email, name, role },
    temporaryPassword,
  });
}
