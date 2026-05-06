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
 *   - fire-and-forget 유지. 실패는 gas_failures 큐에 enqueue → Cron 이 재시도.
 *
 * 환경변수:
 *   - GAS_WEBHOOK_URL (기존) — 미설정 시 호출 자체 스킵
 *   - GAS_WEBHOOK_SECRET (신규) — 미설정 시에도 호출은 하지만 header 미부착
 *     (과도기 배포용; 프로덕션 반영 후 양쪽 세팅 완료되면 미부착은 제거 고려)
 *
 * 실패 큐 (20260506_gas_failures.sql):
 *   2026-05-06 박우빈 상담 건에서 GAS 응답이 17분 지연되어 5초 timeout abort.
 *   페이로드가 console.error 로만 남아 영업 응대 누락 발생. 이후로는 실패 페이로드를
 *   gas_failures 테이블에 보존하고 /api/cron/gas-retry 가 1분 간격으로 재시도한다.
 */

import { createServiceClient } from "@/lib/supabase/server";

export interface GasWebhookOptions {
  /** 로그 식별용 태그 (예: "contract-sign", "consultations/submit"). */
  label: string;
  /** 실패 시 호출자가 추가 처리를 원하면 true. 기본 false(=조용한 실패). */
  rethrow?: boolean;
}

const FETCH_TIMEOUT_MS = 5_000;

export interface GasCallResult {
  ok: boolean;
  /** 성공 시 빈 문자열, 실패 시 사람이 읽을 수 있는 사유. */
  error: string;
}

/**
 * 실제 GAS 호출 한 번. 성공이면 ok=true, 실패면 error 메시지 동봉.
 * Cron 재시도 라우트와 공유한다.
 */
export async function callGasWebhookOnce(
  payload: Record<string, unknown>,
  timeoutMs: number = FETCH_TIMEOUT_MS,
): Promise<GasCallResult> {
  const gasUrl = process.env.GAS_WEBHOOK_URL;
  if (!gasUrl) {
    return { ok: false, error: "GAS_WEBHOOK_URL 미설정" };
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
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      return { ok: false, error: `status=${res.status}` };
    }
    return { ok: true, error: "" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

/**
 * 실패 페이로드를 gas_failures 큐에 보존. enqueue 자체가 실패하면 console.error 만.
 */
async function enqueueGasFailure(
  label: string,
  payload: Record<string, unknown>,
  lastError: string,
): Promise<void> {
  try {
    const sc = createServiceClient();
    const { error } = await sc.from("gas_failures").insert({
      label,
      payload,
      last_error: lastError,
      last_attempt_at: new Date().toISOString(),
    });
    if (error) {
      console.error(`[gas-webhook:${label}] enqueue 실패:`, error.message);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[gas-webhook:${label}] enqueue 예외:`, message);
  }
}

/**
 * GAS 웹훅에 POST 를 보낸다. 응답 기다리되 5초 타임아웃.
 * 실패 시 페이로드를 gas_failures 큐에 보존하고 void 반환.
 */
export async function postToGasWebhook(
  payload: Record<string, unknown>,
  options: GasWebhookOptions,
): Promise<void> {
  if (!process.env.GAS_WEBHOOK_URL) {
    return;
  }

  const result = await callGasWebhookOnce(payload);
  if (!result.ok) {
    const errorMessage = result.error;
    console.error(`[gas-webhook:${options.label}] 호출 실패:`, errorMessage);
    await enqueueGasFailure(options.label, payload, errorMessage);

    if (options.rethrow) {
      throw new Error(`GAS webhook ${options.label} 실패: ${errorMessage}`);
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
