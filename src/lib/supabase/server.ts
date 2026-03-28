import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

/**
 * 서버 사이드 전용 Supabase 서비스 클라이언트.
 * SUPABASE_SERVICE_ROLE_KEY를 사용하며 RLS를 bypass한다.
 *
 * ⚠️ 절대 브라우저에 노출하지 말 것.
 * - Server Components, Route Handlers, Server Actions에서만 사용
 * - NEXT_PUBLIC_ 접두사가 없는 환경변수를 사용하므로 클라이언트 번들에 포함되지 않음
 */
export function createServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다.",
    );
  }

  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
