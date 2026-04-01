/**
 * 인증 토큰을 포함한 API 클라이언트.
 * Supabase 세션 토큰을 Authorization 헤더에 자동으로 첨부합니다.
 */

import { createBrowserClient } from "@/src/lib/supabase/browser";

/**
 * 현재 Supabase 세션의 access_token을 반환합니다.
 * 세션이 없으면 빈 문자열을 반환합니다.
 */
async function getAccessToken(): Promise<string> {
  try {
    const supabase = createBrowserClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token ?? "";
  } catch {
    return "";
  }
}

/**
 * Authorization 헤더가 포함된 fetch 래퍼.
 */
export async function apiFetch(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  const token = await getAccessToken();

  const headers: HeadersInit = {
    ...(options.headers ?? {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  // Content-Type: FormData일 때는 설정하지 않음 (브라우저가 boundary 자동 추가)
  if (options.body && !(options.body instanceof FormData) && !(headers as Record<string, string>)["Content-Type"]) {
    (headers as Record<string, string>)["Content-Type"] = "application/json";
  }

  return fetch(url, { ...options, headers });
}
