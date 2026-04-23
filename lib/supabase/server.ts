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

/**
 * 사용자 JWT(Bearer 토큰) 기반 Supabase 클라이언트.
 * ANON_KEY + Authorization 헤더 조합으로, 요청마다 auth.uid()가 평가되어
 * RLS 정책이 자동 적용된다. Route Handler에서 RLS 권한 경계를 유지할 때 사용.
 *
 * - service_role 클라이언트와 달리 RLS를 bypass하지 않는다.
 * - createSSRClient와 달리 쿠키 대신 헤더 토큰을 받으므로 Bearer API 패턴에 적합.
 */
export function createAuthedClient(accessToken: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL과 NEXT_PUBLIC_SUPABASE_ANON_KEY 환경변수가 필요합니다.",
    );
  }

  return createClient<Database>(supabaseUrl, anonKey, {
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}
