/**
 * 솔라피 알림톡 템플릿 4종 정의.
 *
 * 템플릿 ID 는 솔라피 콘솔 사전 심사 통과 후 발급된다 (영업일 1-3일).
 * 그 전에는 환경변수 placeholder 로 두고, 5/4 신청 → 5/5-7 승인 후 실제 ID 주입.
 *
 * ⚠️ 템플릿 텍스트는 변수 외 수정 불가. 템플릿 본문 자체를 바꾸려면 솔라피에 재심사 신청.
 */

export type AlimtalkTemplateKey =
  | "consultation.new_to_admin"
  | "consultation.assigned_to_dealer"
  | "consultation.timeout_to_admin"
  | "consultation.cancelled_to_dealer";

/**
 * 각 템플릿이 요구하는 변수 타입.
 * 솔라피 변수 표기법은 #{변수명} 이므로 키도 #{...} 로 둔다.
 */
export interface TemplateVarsMap {
  "consultation.new_to_admin": {
    "#{count}": string; // 신규 상담 건수
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
 * 템플릿 키 → 솔라피 콘솔 templateId 매핑.
 * 환경변수 미설정 시 placeholder 반환 → sandbox 모드에서만 동작 (실발송 시 솔라피 4xx 예상).
 */
export function resolveTemplateId(key: AlimtalkTemplateKey): string {
  const envMap: Record<AlimtalkTemplateKey, string | undefined> = {
    "consultation.new_to_admin": process.env.SOLAPI_TEMPLATE_NEW_TO_ADMIN,
    "consultation.assigned_to_dealer": process.env.SOLAPI_TEMPLATE_ASSIGNED_TO_DEALER,
    "consultation.timeout_to_admin": process.env.SOLAPI_TEMPLATE_TIMEOUT_TO_ADMIN,
    "consultation.cancelled_to_dealer": process.env.SOLAPI_TEMPLATE_CANCELLED_TO_DEALER,
  };

  const id = envMap[key];
  if (!id) {
    // sandbox 모드에서는 placeholder 로 동작 가능. 프로덕션에서는 미설정 시 실패.
    return `__PENDING_${key.replace(/\./g, "_").toUpperCase()}__`;
  }
  return id;
}

/**
 * 고객명 PII 마스킹: "홍길동" → "홍*동", "김철" → "김*"
 * Security-Developer 검토 후 정책 변경 가능.
 */
export function maskCustomerName(name: string): string {
  if (!name || name.length < 2) return name;
  if (name.length === 2) return `${name[0]}*`;
  return `${name[0]}${"*".repeat(name.length - 2)}${name[name.length - 1]}`;
}
