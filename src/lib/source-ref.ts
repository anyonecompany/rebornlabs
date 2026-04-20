/**
 * 상담 유입경로(source_ref) UTM 축약값 → 한글 라벨 매핑.
 *
 * 랜딩페이지의 ?ref= 또는 ?utm_source= 파라미터가 DB에 소문자/영문 축약으로
 * 저장되어 어드민 화면에서 직원이 혼동하지 않도록 표시 단계에서만 한글로 변환.
 * DB 저장값은 그대로 유지 (통계/필터링 일관성 유지).
 */

const SOURCE_REF_LABELS: Record<string, string> = {
  // 직접 유입
  direct: "직접",
  spreadsheet_import: "기존 데이터",

  // 인스타그램 계열
  ig: "인스타그램",
  instagram: "인스타그램",
  insta: "인스타그램",

  // 틱톡 계열
  tk: "틱톡",
  tiktok: "틱톡",

  // 당근마켓 계열
  dg: "당근",
  daangn: "당근",
  karrot: "당근",

  // 기타 흔한 UTM
  fb: "페이스북",
  facebook: "페이스북",
  yt: "유튜브",
  youtube: "유튜브",
  naver: "네이버",
  google: "구글",
  kakao: "카카오",
};

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
