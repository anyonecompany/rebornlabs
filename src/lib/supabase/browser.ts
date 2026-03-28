import { createBrowserClient as createClient } from "@supabase/ssr";

import type { Database } from "@/types/database";

/**
 * 브라우저 환경용 Supabase 클라이언트.
 * NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY 사용.
 * RLS 정책이 적용되며, JWT의 user_role claim으로 권한을 판별한다.
 */
export function createBrowserClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL과 NEXT_PUBLIC_SUPABASE_ANON_KEY 환경변수가 필요합니다.",
    );
  }

  return createClient<Database>(supabaseUrl, supabaseAnonKey);
}
