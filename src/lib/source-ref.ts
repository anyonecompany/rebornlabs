/**
 * 상담 유입경로(source_ref) UTM 축약값 → 한글 라벨 매핑.
 *
 * 랜딩페이지의 ?ref= 또는 ?utm_source= 파라미터가 DB에 소문자/영문 축약으로
 * 저장되어 어드민 화면에서 직원이 혼동하지 않도록 표시 단계에서만 한글로 변환.
 * DB 저장값은 그대로 유지 (통계/필터링 일관성 유지).
 *
 * 매핑 추가 규칙:
 * - 시스템 고정값(direct, spreadsheet_import 등)은 기본 포함
 * - 업체/채널 축약값은 **고객/운영팀 확인 후 확정값만** 추가
 * - 확정 이력은 docs/incident-ig-source.md에 기록
 */

export const SOURCE_REF_LABELS: Record<string, string> = {
  // 시스템 고정값
  direct: "직접",
  spreadsheet_import: "기존 데이터",

  // 출처 확정 (2026-04-20): 리본랩스 공식 인스타그램 바이오 링크
  // URL: ...?utm_source=ig&utm_medium=social&utm_content=link_in_bio
  ig: "인스타그램",
  instagram: "인스타그램",
  insta: "인스타그램",
};

/**
 * source_ref → marketing_companies.name 별칭 매핑.
 *
 * 상담 접수 API가 ref 값으로 마케팅업체를 자동 매칭할 때 사용.
 * 예: source_ref='ig' → 실제 등록된 업체명 '인스타그램'
 *
 * 매핑에 없는 값은 원본 그대로 사용하여 기존 업체명 매칭 동작 유지.
 */
export const SOURCE_REF_TO_COMPANY: Record<string, string> = {
  // 인스타그램 (2026-04-20 확정)
  ig: "인스타그램",
  instagram: "인스타그램",
  insta: "인스타그램",
};

/**
 * source_ref 값을 실제 marketing_companies.name 조회용 키로 변환합니다.
 *
 * - 별칭 매핑에 있으면 한글 업체명 반환
 * - 없으면 원본(trim 유지) 반환 → 기존 업체명 직접 매칭 경로
 */
export function resolveCompanyName(sourceRef: string): string {
  const lower = sourceRef.trim().toLowerCase();
  return SOURCE_REF_TO_COMPANY[lower] ?? sourceRef;
}

/**
 * 유입경로 값을 화면 표시용 라벨로 변환합니다.
 *
 * - null/undefined/빈 문자열 → "직접"
 * - 매핑 테이블에 있는 값(대소문자 무시) → 한글 라벨
 * - 매핑에 없는 값 → decodeURIComponent 원본 (디코딩 실패 시 raw)
 */
export function formatSourceRef(value: string | null | undefined): string {
  if (!value) return "직접";

  const trimmed = value.trim().toLowerCase();
  const label = SOURCE_REF_LABELS[trimmed];
  if (label) return label;

  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * "직접" 값인지 판별 (회색 표시 여부 결정용).
 *
 * DB 원본값 기준으로 판단 — 라벨로 변환되기 전 단계.
 */
export function isDirectSource(value: string | null | undefined): boolean {
  if (!value) return true;
  return value.trim().toLowerCase() === "direct";
}
