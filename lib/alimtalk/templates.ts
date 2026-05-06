/**
 * 카카오 알림톡 템플릿 4종 정의 (알리고 발송).
 *
 * 템플릿 코드(tpl_code)는 알리고 콘솔 사전심사 통과 후 발급된다 (영업일 1~2일).
 * 그 전에는 환경변수가 비어 있고, client.ts 의 `failover=Y` 설정으로 알리고가
 * 알림톡 거부 시 자동 SMS 발송 → 박우빈 같은 누락 즉시 차단.
 *
 * ⚠️ 템플릿 본문은 사전심사 후 변수 외 수정 불가. 본문을 바꾸려면 재심사.
 */

export type AlimtalkTemplateKey =
  | "consultation.new_to_admin"
  | "consultation.assigned_to_dealer"
  | "consultation.timeout_to_admin"
  | "consultation.cancelled_to_dealer";

/**
 * 각 템플릿이 요구하는 변수 타입.
 * 알리고 변수 표기법도 #{변수명} 이므로 키도 #{...} 로 둔다.
 */
export interface TemplateVarsMap {
  "consultation.new_to_admin": {
    "#{customer_name}": string; // 고객명 마스킹 (홍*동)
    "#{vehicle}": string; // 관심 차량 (또는 "미지정")
    "#{admin_link}": string; // 어드민 상담 목록 링크
  };
  "consultation.assigned_to_dealer": {
    "#{customer_name}": string; // 고객명 (마스킹: 홍*동)
    "#{vehicle}": string; // 관심 차량
    "#{ack_link}": string; // 응대 시작 링크
  };
  "consultation.timeout_to_admin": {
    "#{customer_name}": string; // 고객명 마스킹
    "#{dealer_name}": string; // 미응답 딜러명
    "#{reassign_link}": string; // 재배정 링크
  };
  "consultation.cancelled_to_dealer": {
    "#{customer_name}": string; // 고객명 마스킹
    "#{reason}": string; // "30분 무응답으로 자동 취소" | "관리자 수동 취소"
  };
}

/**
 * 템플릿 키 → 알리고 콘솔 tpl_code 매핑.
 * 환경변수 미설정 시 빈 문자열 반환 — 알리고는 tpl_code 빈 값일 때 알림톡 거부 → failover=Y 로 SMS 자동 대체.
 */
export function resolveTemplateId(key: AlimtalkTemplateKey): string {
  const envMap: Record<AlimtalkTemplateKey, string | undefined> = {
    "consultation.new_to_admin": process.env.ALIGO_TPL_CODE_NEW_TO_ADMIN,
    "consultation.assigned_to_dealer": process.env.ALIGO_TPL_CODE_ASSIGNED_TO_DEALER,
    "consultation.timeout_to_admin": process.env.ALIGO_TPL_CODE_TIMEOUT_TO_ADMIN,
    "consultation.cancelled_to_dealer": process.env.ALIGO_TPL_CODE_CANCELLED_TO_DEALER,
  };
  return envMap[key] ?? "";
}

/**
 * 변수 치환 — 알리고는 클라이언트가 message_1 본문에 변수를 미리 치환한 텍스트를 보낸다.
 * 사전심사 통과한 템플릿 본문에 변수 자리만 채우고, 그 외 텍스트는 절대 수정 금지.
 */
export function fillTemplate(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (acc, [key, value]) => acc.split(key).join(value),
    template,
  );
}

/**
 * 사전심사 신청한 4종 템플릿 본문.
 * 알리고 콘솔 등록 시 이 본문 그대로 등록 → 사전심사 통과 후 tpl_code 발급.
 * 본문 수정 시 코드 + 알리고 콘솔 + 재심사 모두 동기화 필요.
 */
export const TEMPLATE_BODIES: Record<AlimtalkTemplateKey, string> = {
  "consultation.new_to_admin":
    "[리본랩스] 신규 상담 접수\n\n#{customer_name}님이 #{vehicle} 상담을 신청했습니다.\n어드민에서 즉시 응대해주세요.\n\n#{admin_link}",
  "consultation.assigned_to_dealer":
    "[리본랩스] 상담 배정 알림\n\n고객 #{customer_name}님 (#{vehicle}) 상담이 배정되었습니다.\n30분 내 응대 시작 버튼을 눌러주세요.\n\n#{ack_link}",
  "consultation.timeout_to_admin":
    "[리본랩스] 30분 무응답 알림\n\n고객 #{customer_name}님 상담이 #{dealer_name} 딜러에게 30분 무응답으로 자동 취소되었습니다.\n재배정해주세요.\n\n#{reassign_link}",
  "consultation.cancelled_to_dealer":
    "[리본랩스] 상담 배정 취소\n\n고객 #{customer_name}님 상담 배정이 취소되었습니다.\n사유: #{reason}",
};

/**
 * 고객명 PII 마스킹: "홍길동" → "홍*동", "김철" → "김*"
 */
export function maskCustomerName(name: string): string {
  if (!name || name.length < 2) return name;
  if (name.length === 2) return `${name[0]}*`;
  return `${name[0]}${"*".repeat(name.length - 2)}${name[name.length - 1]}`;
}
