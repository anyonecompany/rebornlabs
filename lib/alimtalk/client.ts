/**
 * 알리고(Aligo) 카카오 알림톡 REST 클라이언트.
 *
 * - 발신 채널: 리본랩스 공식 카카오채널 (알리고 발신프로필 senderkey 로 매핑)
 * - 인증: form-encoded `apikey` + `userid`
 * - 사전심사 통과 전까지 `failover=Y` 로 SMS 자동 대체 → 박우빈 같은 누락 즉시 차단
 * - testMode(`ALIGO_TEST_MODE=Y`) 면 실제 발송 없이 mock 응답
 *
 * 알리고 알림톡 send API:
 *   POST https://kakaoapi.aligo.in/akv10/alimtalk/send/
 *   Content-Type: application/x-www-form-urlencoded
 *
 * 응답 본문 (JSON):
 *   { code: 0|음수, message: string, info: object | null }
 *   code === 0 만 성공. 그 외는 알림톡 거부 → failover=Y 면 알리고가 자동 SMS 발송.
 */

import { randomBytes } from "node:crypto";

const ALIGO_ALIMTALK_ENDPOINT = "https://kakaoapi.aligo.in/akv10/alimtalk/send/";

export interface AligoConfig {
  apiKey: string;
  userId: string;
  senderKey: string;
  fromNumber: string;
  testMode: boolean;
}

export interface AlimtalkPayload {
  /** 수신 번호 (-/공백 없이) */
  to: string;
  /** 알리고 콘솔에서 발급한 템플릿 코드. 사전심사 통과 전이면 비어 있어도 됨 (failover SMS) */
  templateId: string;
  /** 메시지 본문 — 알림톡 템플릿 본문에 변수 치환된 결과. failover SMS 본문이 별도로 없으면 이걸로 발송. */
  message: string;
  /** SMS 폴백 시 본문. 미지정 시 message 그대로 사용. 90자 이내 권장 (LMS 변환 비용↑) */
  fmessage?: string;
  /** SMS 제목 (LMS). 미지정 시 빈 문자열 */
  fsubject?: string;
  /** 알림톡 버튼 (선택) */
  buttons?: AlimtalkButton[];
}

export interface AlimtalkButton {
  name: string;
  linkType: "WL" | "AL" | "DS" | "BK" | "MD";
  linkMo?: string;
  linkPc?: string;
  linkAnd?: string;
  linkIos?: string;
}

export interface AlimtalkSendResponse {
  /** 알리고 응답 코드. 0 이면 성공. 음수는 거부 사유 (failover=Y 면 알리고가 SMS 자동 대체) */
  code: number;
  message: string;
  /** 메시지 ID 등 */
  info: Record<string, unknown> | null;
  status: "sent" | "test_mode" | "failed";
}

export class AligoHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
    message?: string,
  ) {
    super(message ?? `Aligo HTTP ${status}: ${body.slice(0, 200)}`);
    this.name = "AligoHttpError";
  }
}

export function loadAligoConfig(): AligoConfig {
  const apiKey = process.env.ALIGO_API_KEY;
  const userId = process.env.ALIGO_USER_ID;
  const senderKey = process.env.ALIGO_SENDER_KEY;
  const fromNumber = process.env.ALIGO_FROM_NUMBER;
  const testMode = process.env.ALIGO_TEST_MODE === "Y";

  if (!apiKey || !userId || !senderKey || !fromNumber) {
    throw new Error(
      "Aligo config missing. Set ALIGO_API_KEY, ALIGO_USER_ID, ALIGO_SENDER_KEY, ALIGO_FROM_NUMBER in .env.local",
    );
  }

  return { apiKey, userId, senderKey, fromNumber, testMode };
}

/**
 * 알리고 알림톡 단건 발송. failover=Y 로 항상 SMS 자동 대체 가능 상태.
 * - testMode 면 네트워크 호출 없이 mock 응답.
 * - HTTP 5xx / 네트워크 에러는 AligoHttpError 로 throw → send.ts envelope 가 재시도.
 * - HTTP 200 이지만 알리고 응답 code !== 0 인 경우(템플릿 미인증 등): failover=Y 로 SMS 자동 발송됐다면 ok 처리.
 */
export async function sendAlimtalkRaw(
  payload: AlimtalkPayload,
  config: AligoConfig = loadAligoConfig(),
): Promise<AlimtalkSendResponse> {
  if (config.testMode) {
    return {
      code: 0,
      message: "test mode (no network)",
      info: { note: "ALIGO_TEST_MODE=Y", payload, mockId: randomBytes(8).toString("hex") },
      status: "test_mode",
    };
  }

  const form = new URLSearchParams();
  form.set("apikey", config.apiKey);
  form.set("userid", config.userId);
  form.set("senderkey", config.senderKey);
  form.set("tpl_code", payload.templateId);
  form.set("sender", config.fromNumber);
  form.set("receiver_1", payload.to);
  form.set("subject_1", "리본랩스");
  form.set("message_1", payload.message);
  form.set("failover", "Y");
  form.set("fsubject_1", payload.fsubject ?? "리본랩스 신규 상담 알림");
  form.set("fmessage_1", payload.fmessage ?? payload.message);

  if (payload.buttons && payload.buttons.length > 0) {
    form.set("button_1", JSON.stringify({ button: payload.buttons }));
  }

  const response = await fetch(ALIGO_ALIMTALK_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new AligoHttpError(response.status, text);
  }

  let parsed: { code: number; message: string; info: Record<string, unknown> | null };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new AligoHttpError(response.status, text, "Aligo response not JSON");
  }

  // code === 0 → 알림톡 발송 성공
  // code !== 0 + failover=Y → 알리고가 SMS 자동 대체. 응답 code 는 알림톡 측 거부 사유.
  // 어느 경우든 운영자에게 메시지는 도착 → status: "sent"
  return {
    code: parsed.code,
    message: parsed.message,
    info: parsed.info,
    status: "sent",
  };
}
