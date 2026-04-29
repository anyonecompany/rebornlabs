/**
 * Supabase ilike 쿼리에 사용하는 LIKE 패턴 이스케이프.
 *
 * `%`와 `_`는 SQL LIKE 와일드카드이므로, 사용자 입력에 포함된 경우
 * 이스케이프하지 않으면 의도치 않은 풀 테이블 스캔을 유발할 수 있다.
 */
export function escapeLike(input: string): string {
  return input
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
}
