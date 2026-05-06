/**
 * 알림톡 전송 envelope.
 *
 * - 재시도 3회 (exponential backoff: 200ms / 800ms / 3200ms)
 * - 4xx (영구 에러)는 즉시 dead-letter, 재시도 안 함
 * - 5xx / 네트워크 에러만 재시도
 * - 모든 발송/실패 이벤트는 audit_logs 테이블에 INSERT (감사 로그)
 *
 * 참고 패턴: integrations/slack/slack_notifier.py 의 envelope (httpx async + 5s 타임아웃 + 에러 로깅).
 * 단, slack 은 단일 시도 + 재시도 없음 → 알림톡은 재시도 3회 + dead-letter 추가.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  type AlimtalkPayload,
  type AlimtalkSendResponse,
  AligoHttpError,
  sendAlimtalkRaw,
} from "./client";
import {
  type AlimtalkTemplateKey,
  type TemplateVarsMap,
  TEMPLATE_BODIES,
  fillTemplate,
  resolveTemplateId,
} from "./templates";

const RETRY_DELAYS_MS = [200, 800, 3200] as const;

export interface SendAlimtalkInput<K extends AlimtalkTemplateKey> {
  template: K;
  to: string;
  variables: TemplateVarsMap[K];
  /** 감사 로그에 함께 기록할 컨텍스트 (consultation_id, assignment_id 등) */
  auditContext?: Record<string, unknown>;
  /** SMS 폴백 시 본문 — 미지정 시 알림톡 본문(변수 치환 후) 그대로 사용 */
  fmessage?: string;
}

export interface SendAlimtalkResult {
  ok: boolean;
  attempts: number;
  response?: AlimtalkSendResponse;
  error?: string;
}

/**
 * 알림톡 전송 + 감사 로그 + 재시도.
 * 호출자가 try/catch 할 필요 없음 — 결과는 SendAlimtalkResult 로 반환.
 *
 * 알리고 specifics:
 *   - tpl_code 미설정 또는 사전심사 미통과 → 알리고가 알림톡 거부, failover=Y 로 SMS 자동 발송
 *   - HTTP 200 + code !== 0 도 status="sent" 로 처리 (SMS 폴백됨)
 *   - 5xx/네트워크 에러만 재시도. 4xx 는 즉시 dead-letter.
 */
export async function sendAlimtalk<K extends AlimtalkTemplateKey>(
  input: SendAlimtalkInput<K>,
  supabase?: SupabaseClient,
): Promise<SendAlimtalkResult> {
  const variables = input.variables as Record<string, string>;
  const message = fillTemplate(TEMPLATE_BODIES[input.template], variables);
  const payload: AlimtalkPayload = {
    to: input.to,
    templateId: resolveTemplateId(input.template),
    message,
    fmessage: input.fmessage ?? message,
  };

  let lastError: string | undefined;
  for (let attempt = 1; attempt <= RETRY_DELAYS_MS.length + 1; attempt++) {
    try {
      const response = await sendAlimtalkRaw(payload);
      await logAuditEvent(supabase, "alimtalk.sent", input, {
        attempts: attempt,
        response,
      });
      return { ok: true, attempts: attempt, response };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);

      // 4xx 는 영구 에러 — 재시도 무의미
      if (error instanceof AligoHttpError && error.status >= 400 && error.status < 500) {
        await logAuditEvent(supabase, "alimtalk.failed_permanent", input, {
          attempts: attempt,
          status: error.status,
          body: error.body.slice(0, 500),
        });
        return { ok: false, attempts: attempt, error: lastError };
      }

      // 5xx / 네트워크 에러 — 재시도
      if (attempt <= RETRY_DELAYS_MS.length) {
        await sleep(RETRY_DELAYS_MS[attempt - 1]);
        continue;
      }

      // 마지막 시도도 실패 → dead-letter
      await logAuditEvent(supabase, "alimtalk.failed_dead_letter", input, {
        attempts: attempt,
        error: lastError,
      });
      return { ok: false, attempts: attempt, error: lastError };
    }
  }

  // 도달 불가 (안전망)
  return { ok: false, attempts: RETRY_DELAYS_MS.length + 1, error: lastError };
}

/**
 * audit_logs 테이블에 알림톡 이벤트 기록.
 * supabase 클라이언트 미주입 시 service-role 로 자체 생성 (서버 사이드 전용).
 */
async function logAuditEvent<K extends AlimtalkTemplateKey>(
  supabase: SupabaseClient | undefined,
  action: "alimtalk.sent" | "alimtalk.failed_permanent" | "alimtalk.failed_dead_letter",
  input: SendAlimtalkInput<K>,
  metadata: Record<string, unknown>,
): Promise<void> {
  const client = supabase ?? getServiceRoleClient();
  if (!client) return; // env 미설정 시 silent skip (dev 로컬 머신 케이스)

  const targetId = (input.auditContext?.assignment_id as string | undefined) ?? null;

  try {
    await client.from("audit_logs").insert({
      actor_id: null, // 시스템 발송
      action,
      target_type: "alimtalk",
      target_id: targetId,
      metadata: {
        template: input.template,
        to_masked: maskPhone(input.to),
        ...input.auditContext,
        ...metadata,
      },
    });
  } catch (err) {
    // 감사 로그 실패는 알림톡 결과에 영향 안 줌 (best-effort)
    console.warn("[alimtalk] audit_log insert failed:", err);
  }
}

let _serviceRoleClient: SupabaseClient | undefined;
function getServiceRoleClient(): SupabaseClient | undefined {
  if (_serviceRoleClient) return _serviceRoleClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return undefined;
  _serviceRoleClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _serviceRoleClient;
}

function maskPhone(phone: string): string {
  // "01012345678" → "010****5678"
  if (phone.length < 8) return "****";
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
