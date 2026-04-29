/**
 * 전화번호 입력 시 실시간 하이픈 자동 삽입 헬퍼.
 *
 * - 숫자 외 문자 제거 후 최대 11자리 허용
 * - 4자리 미만 → 숫자만 반환
 * - 4~7자리 → 010-XXXX
 * - 8자리 이상 → 010-XXXX-XXXX
 *
 * apply-form.tsx 등 phone input 의 onChange 에서 사용한다.
 */
export function formatPhoneInput(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, "").slice(0, 11);
  if (digits.length < 4) return digits;
  if (digits.length < 8) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

/**
 * 전화번호 문자열을 한국 표준 형식으로 포맷합니다.
 *
 * 규칙:
 * - null/undefined/빈 문자열 → "—"
 * - 숫자만 추출 후 재조합
 * - 10자리 (앞자리 0 미포함) → "0" 복원 후 처리
 * - 11자리 → 010-1234-5678
 * - 10자리 → 010-123-4567
 * - 그 외 → 원본 그대로 반환
 */
export function formatPhone(raw: string | null | undefined): string {
  if (!raw) return "—";

  // 숫자만 추출
  let digits = raw.replace(/[^0-9]/g, "");

  // 앞에 0이 빠진 경우 복원 (10자리이면서 0으로 시작하지 않음)
  if (digits.length === 10 && !digits.startsWith("0")) {
    digits = "0" + digits;
  }

  // 11자리: 010-1234-5678
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }

  // 10자리: 010-123-4567
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  // 기타: 원본 반환
  return raw;
}
