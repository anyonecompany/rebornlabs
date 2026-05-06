/**
 * 솔라피 (Solapi) REST API 클라이언트.
 *
 * - HMAC-SHA256 시그니처 자체 생성 (의존성 추가 없음, fetch 표준)
 * - sandbox 모드(ALIMTALK_SANDBOX_MODE=true) 일 때 실제 발송 대신 mock 응답 반환
 * - dev 환경 전용. 프로덕션 발신번호 사용 금지.
 *
 * 인증 헤더 형식 (솔라피 공식):
 *   Authorization: HMAC-SHA256 apiKey={KEY}, date={ISO8601}, salt={NONCE}, signature={HEX_HMAC}
 *   signature = HMAC_SHA256(date + salt, apiSecret)
 */

import { createHmac, randomBytes } from "node:crypto";

const SOLAPI_API_BASE = "https://api.solapi.com";

export interface SolapiConfig {
  apiKey: string;
  apiSecret: string;
  pfId: string;
  fromNumber: string;
  sandbox: boolean;
}

export interface AlimtalkPayload {
  to: string;
  templateId: string;
  variables: Record<string, string>;
}

export interface SolapiSendResponse {
  groupId: string;
  messageId: string;
  status: "sent" | "queued" | "sandbox" | "failed";
  raw?: unknown;
}

export class SolapiHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
    message?: string,
  ) {
    super(message ?? `Solapi HTTP ${status}: ${body.slice(0, 200)}`);
    this.name = "SolapiHttpError";
  }
}

export function loadSolapiConfig(): SolapiConfig {
  const apiKey = process.env.SOLAPI_API_KEY;
  const apiSecret = process.env.SOLAPI_API_SECRET;
  const pfId = process.env.SOLAPI_PFID;
  const fromNumber = process.env.SOLAPI_FROM_NUMBER;
  const sandbox = process.env.ALIMTALK_SANDBOX_MODE !== "false";

  if (!apiKey || !apiSecret || !pfId || !fromNumber) {
    throw new Error(
      "Solapi config missing. Set SOLAPI_API_KEY, SOLAPI_API_SECRET, SOLAPI_PFID, SOLAPI_FROM_NUMBER in .env.local",
    );
  }

  return { apiKey, apiSecret, pfId, fromNumber, sandbox };
}

function buildAuthHeader(config: SolapiConfig): string {
  const date = new Date().toISOString();
  const salt = randomBytes(32).toString("hex");
  const signature = createHmac("sha256", config.apiSecret)
    .update(date + salt)
    .digest("hex");
  return `HMAC-SHA256 apiKey=${config.apiKey}, date=${date}, salt=${salt}, signature=${signature}`;
}

/**
 * 솔라피 단일 알림톡 발송.
 * - sandbox 모드면 네트워크 호출 없이 mock 응답 반환.
 * - HTTP 5xx / 네트워크 에러는 SolapiHttpError 로 throw → send.ts 의 envelope 가 재시도.
 */
export async function sendAlimtalkRaw(
  payload: AlimtalkPayload,
  config: SolapiConfig = loadSolapiConfig(),
): Promise<SolapiSendResponse> {
  if (config.sandbox) {
    return {
      groupId: `sandbox-${Date.now()}`,
      messageId: `sandbox-${randomBytes(8).toString("hex")}`,
      status: "sandbox",
      raw: { note: "ALIMTALK_SANDBOX_MODE=true 로 실제 발송 미실행", payload },
    };
  }

  const body = {
    message: {
      to: payload.to,
      from: config.fromNumber,
      kakaoOptions: {
        pfId: config.pfId,
        templateId: payload.templateId,
        variables: payload.variables,
        // 알림톡 실패 시 SMS 폴백 비활성 (의도하지 않은 SMS 비용 방지). 추후 정책 결정 시 disableSms=false 로.
        disableSms: true,
      },
    },
  };

  const response = await fetch(`${SOLAPI_API_BASE}/messages/v4/send`, {
    method: "POST",
    headers: {
      Authorization: buildAuthHeader(config),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new SolapiHttpError(response.status, text);
  }

  let parsed: { groupId?: string; messageId?: string; statusCode?: string };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new SolapiHttpError(response.status, text, "Solapi response not JSON");
  }

  return {
    groupId: parsed.groupId ?? "",
    messageId: parsed.messageId ?? "",
    status: parsed.statusCode === "2000" ? "sent" : "queued",
    raw: parsed,
  };
}
