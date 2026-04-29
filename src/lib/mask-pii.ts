/**
 * PII 마스킹 헬퍼.
 * 사용자 목록 등 어드민 테이블에서 이메일/전화번호를 부분 마스킹합니다.
 */

/**
 * 이메일 마스킹: local 앞 2자만 노출, 나머지 *
 * 예) hongildong@example.com → ho*******@example.com
 */
export function maskEmail(email: string): string {
  const atIdx = email.indexOf("@");
  if (atIdx < 0) return email; // @가 없으면 원본 반환
  const local = email.slice(0, atIdx);
  const domain = email.slice(atIdx); // '@domain.com' 포함
  const visibleLen = Math.min(2, local.length);
  const visible = local.slice(0, visibleLen);
  const masked = "*".repeat(Math.max(0, local.length - visibleLen));
  return `${visible}${masked}${domain}`;
}

/**
 * 전화번호 마스킹: 숫자만 추출 후 앞 3자리-****-뒤 4자리
 * 예) 010-1234-5678 → 010-****-5678
 */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 8) return phone; // 너무 짧으면 원본 반환
  return `${digits.slice(0, 3)}-****-${digits.slice(-4)}`;
}
