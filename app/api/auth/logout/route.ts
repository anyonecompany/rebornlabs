import { NextResponse } from "next/server";

import { createSSRClient } from "@/lib/supabase/server-ssr";

export async function POST() {
  try {
    const supabase = await createSSRClient();
    await supabase.auth.signOut();
  } catch {
    // 세션이 없어도 로그아웃 처리
  }

  const response = NextResponse.json({ success: true });

  // 세션 쿠키 + 프로필 캐시 클리어
  response.cookies.delete("sb-access-token");
  response.cookies.delete("sb-refresh-token");
  response.cookies.delete("x-profile-cache");

  return response;
}
