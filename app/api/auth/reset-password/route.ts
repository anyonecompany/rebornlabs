import { NextRequest, NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/server";

interface ResetPasswordRequest {
  email: string;
}

export async function POST(request: NextRequest) {
  let body: ResetPasswordRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "요청 데이터 형식이 올바르지 않습니다." },
      { status: 400 },
    );
  }

  const { email } = body;
  if (!email) {
    return NextResponse.json(
      { error: "이메일을 입력해주세요." },
      { status: 400 },
    );
  }

  try {
    const supabase = createServiceClient();
    await supabase.auth.resetPasswordForEmail(email);
  } catch {
    // 이메일 존재 여부 노출 방지 — 항상 성공 응답
  }

  return NextResponse.json({
    message: "등록된 이메일로 비밀번호 재설정 링크를 발송했습니다.",
  });
}
