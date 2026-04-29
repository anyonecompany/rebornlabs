/**
 * Cloudflare Turnstile CAPTCHA 서버 측 검증 헬퍼.
 *
 * 환경변수:
 *   TURNSTILE_SECRET_KEY  — Cloudflare 대시보드에서 발급한 서버 시크릿
 *   ENABLE_CAPTCHA        — "true"로 설정해야 실 검증 활성화
 *
 * 동작 규칙:
 *   - ENABLE_CAPTCHA !== "true" → console.warn 후 통과 (개발 환경 호환)
 *   - ENABLE_CAPTCHA === "true" && TURNSTILE_SECRET_KEY 미설정 → console.warn 후 통과
 *   - ENABLE_CAPTCHA === "true" && TURNSTILE_SECRET_KEY 설정 → 실 검증 수행
 *   - token 없이 ENABLE_CAPTCHA === "true" → false 반환 (거부)
 */

interface TurnstileVerifyResponse {
  success: boolean;
  "error-codes"?: string[];
  challenge_ts?: string;
  hostname?: string;
}

/**
 * Cloudflare Turnstile 서버 측 토큰 검증.
 *
 * @param token  클라이언트가 전송한 cf-turnstile-response 토큰 (undefined 허용)
 * @param ip     요청자 IP 주소 (remoteip로 전달, Cloudflare 권고 사항)
 * @returns      검증 성공 여부
 */
export async function verifyTurnstile(
  token: string | undefined,
  ip: string,
): Promise<boolean> {
  const enabled = process.env.ENABLE_CAPTCHA === "true";

  if (!enabled) {
    console.warn(
      "[captcha] DISABLED — ENABLE_CAPTCHA != 'true'. Set ENABLE_CAPTCHA=true with TURNSTILE_SECRET_KEY to enable real verification.",
    );
    return true;
  }

  const secretKey = process.env.TURNSTILE_SECRET_KEY;

  if (!secretKey) {
    console.warn(
      "[captcha] ENABLE_CAPTCHA=true but TURNSTILE_SECRET_KEY is not set. Skipping verification. Set TURNSTILE_SECRET_KEY to enforce CAPTCHA.",
    );
    return true;
  }

  // CAPTCHA 활성화 + 시크릿 설정된 상태에서 token 미제출 → 거부
  if (!token) {
    return false;
  }

  const body = new URLSearchParams({
    secret: secretKey,
    response: token,
    remoteip: ip,
  });

  let data: TurnstileVerifyResponse;

  try {
    const res = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      },
    );

    if (!res.ok) {
      console.error(
        `[captcha] Turnstile API 오류: HTTP ${res.status}`,
      );
      return false;
    }

    data = (await res.json()) as TurnstileVerifyResponse;
  } catch (err) {
    console.error("[captcha] Turnstile 네트워크 오류:", err);
    return false;
  }

  if (!data.success) {
    console.warn("[captcha] Turnstile 검증 실패:", data["error-codes"]);
  }

  return data.success;
}
