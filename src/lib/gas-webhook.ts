/**
 * GAS 웹훅 호출 공용 유틸.
 *
 * 왜 이 유틸이 필요한가:
 *   GAS 핸들러는 action 문자열만으로 고객 이메일·알림을 트리거하는데, 앱 외부에
 *   URL이 유출되면 누구나 curl 로 위조 payload 를 보낼 수 있다 — 고객에게 위조 계약
 *   완료 이메일을 발송할 수 있는 구조적 취약점.
 *
 * 대응:
 *   - 앱 측에서 Authorization: Bearer ${GAS_WEBHOOK_SECRET} 헤더를 붙여 호출
 *   - GAS 핸들러는 해당 헤더가 없으면 403 반환 (GAS 코드는 대표가 수동 적용)
 *   - fetch 는 5초 타임아웃으로 묶어 main flow 지연 방지
 *   - fire-and-forget 유지. 실패는 로그만 남기고 요청 응답은 항상 성공 처리.
 *
 * 환경변수:
 *   - GAS_WEBHOOK_URL (기존) — 미설정 시 호출 자체 스킵
 *   - GAS_WEBHOOK_SECRET (신규) — 미설정 시에도 호출은 하지만 header 미부착
 *     (과도기 배포용; 프로덕션 반영 후 양쪽 세팅 완료되면 미부착은 제거 고려)
 */

export interface GasWebhookOptions {
  /** 로그 식별용 태그 (예: "contract-sign", "consultations/submit"). */
  label: string;
  /** 실패 시 호출자가 추가 처리를 원하면 true. 기본 false(=조용한 실패). */
  rethrow?: boolean;
}

/**
 * GAS 웹훅에 POST 를 보낸다. 응답 기다리되 5초 타임아웃.
 * 실패는 stderr 로그만 남기고 void 반환.
 */
export async function postToGasWebhook(
  payload: Record<string, unknown>,
  options: GasWebhookOptions,
): Promise<void> {
  const gasUrl = process.env.GAS_WEBHOOK_URL;
  if (!gasUrl) {
    return;
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const secret = process.env.GAS_WEBHOOK_SECRET;
  if (secret) {
    headers["Authorization"] = `Bearer ${secret}`;
  }

  try {
    const res = await fetch(gasUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      console.error(
        `[gas-webhook:${options.label}] 응답 비정상 status=${res.status}`,
      );
      if (options.rethrow) {
        throw new Error(`GAS webhook ${options.label} 실패: ${res.status}`);
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[gas-webhook:${options.label}] 호출 실패:`, message);
    if (options.rethrow) {
      throw err;
    }
  }
}

/**
 * fire-and-forget 헬퍼 — await 없이 호출해도 unhandled rejection 이 안 나오도록 void 래핑.
 * 사용처는 `voidGasWebhook(...)` 한 줄이면 된다.
 */
export function voidGasWebhook(
  payload: Record<string, unknown>,
  options: GasWebhookOptions,
): void {
  void postToGasWebhook(payload, options);
}
