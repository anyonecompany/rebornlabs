/**
 * 인증 토큰을 포함한 API 클라이언트.
 * Supabase 세션 토큰을 Authorization 헤더에 자동으로 첨부합니다.
 * 401 응답 시 세션 갱신 후 1회 재시도합니다.
 */

import { createBrowserClient } from "@/src/lib/supabase/browser";

async function getAccessToken(): Promise<string> {
  try {
    const supabase = createBrowserClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (session?.access_token) return session.access_token;

    // 세션 없으면 refresh 시도
    const { data } = await supabase.auth.refreshSession();
    return data.session?.access_token ?? "";
  } catch {
    return "";
  }
}

export async function apiFetch(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  const token = await getAccessToken();

  const headers: HeadersInit = {
    ...(options.headers ?? {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  if (options.body && !(options.body instanceof FormData) && !(headers as Record<string, string>)["Content-Type"]) {
    (headers as Record<string, string>)["Content-Type"] = "application/json";
  }

  const res = await fetch(url, { ...options, headers });

  // 401 → 세션 갱신 후 1회 재시도
  if (res.status === 401) {
    try {
      const supabase = createBrowserClient();
      const { data } = await supabase.auth.refreshSession();
      const newToken = data.session?.access_token;
      if (newToken) {
        const retryHeaders: HeadersInit = {
          ...(options.headers ?? {}),
          Authorization: `Bearer ${newToken}`,
        };
        if (options.body && !(options.body instanceof FormData) && !(retryHeaders as Record<string, string>)["Content-Type"]) {
          (retryHeaders as Record<string, string>)["Content-Type"] = "application/json";
        }
        return fetch(url, { ...options, headers: retryHeaders });
      }
    } catch {
      // 갱신 실패 → 원래 401 반환
    }
    // 갱신 실패 → /login 리다이렉트
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
  }

  return res;
}
